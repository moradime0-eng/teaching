import {
  Component,
  OnInit,
  signal,
  Output,
  EventEmitter,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';
import { NotificationService } from '../../../core/services/notification.service';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';

@Component({
  selector: 'app-notification-panel',
  standalone: true,
  imports: [CommonModule, MatIconModule, JalaliDatePipe],
  template: `
    <div class="notif-panel" (click)="$event.stopPropagation()">
      <!-- Header -->
      <div class="notif-header">
        <div class="notif-title">
          <mat-icon>notifications</mat-icon>
          <h4>اعلان‌ها و پیام‌ها</h4>
        </div>
        <button
          class="btn-mark-all"
          *ngIf="summary() && summary()!.totalUnread > 0"
          (click)="markAllRead()"
        >
          <mat-icon>done_all</mat-icon>
          <span>خواندن همه</span>
        </button>
      </div>

      <!-- Loading -->
      <div class="notif-loading" *ngIf="isLoading()">
        <div class="spinner"></div>
        <span>در حال بارگذاری...</span>
      </div>

      <!-- Empty State -->
      <div class="notif-empty" *ngIf="!isLoading() && (!summary() || summary()!.totalUnread === 0)">
        <mat-icon>notifications_off</mat-icon>
        <p>اعلان جدیدی ندارید</p>
      </div>

      <!-- Content -->
      <div class="notif-content" *ngIf="!isLoading() && summary() && summary()!.totalUnread > 0">
        <!-- Unread Messages Section -->
        <div class="notif-section" *ngIf="summary()!.recentMessages.length > 0">
          <div class="section-header">
            <mat-icon class="section-icon msg-icon">chat</mat-icon>
            <span class="section-title">پیام‌های خوانده‌نشده</span>
            <span class="section-count">{{ summary()!.unreadMessages }}</span>
          </div>

          <div
            class="notif-item"
            *ngFor="let item of summary()!.recentMessages"
            (click)="openConversation(item.conversationId)"
          >
            <div class="item-avatar">
              <img *ngIf="item.message?.sender?.avatar" [src]="item.message.sender.avatar" />
              <div class="avatar-placeholder" *ngIf="!item.message?.sender?.avatar">
                {{ getInitials(item.message?.sender?.fullName) }}
              </div>
            </div>
            <div class="item-content">
              <div class="item-top">
                <span class="item-name">{{ item.message?.sender?.fullName || 'کاربر' }}</span>
                <span class="item-time">{{ item.message?.createdAt | jalaliDate: 'HH:mm' }}</span>
              </div>
              <p class="item-text">{{ getMessagePreview(item.message?.content) }}</p>
            </div>
            <span class="item-badge" *ngIf="item.unreadCount > 0">{{ item.unreadCount }}</span>
          </div>

          <button class="btn-see-all" (click)="goToMessages()">
            مشاهده همه پیام‌ها
            <mat-icon>arrow_back</mat-icon>
          </button>
        </div>

        <!-- Unread Notifications Section -->
        <div class="notif-section" *ngIf="summary()!.recentNotifications.length > 0">
          <div class="section-header">
            <mat-icon class="section-icon notif-icon">campaign</mat-icon>
            <span class="section-title">اعلان‌ها</span>
            <span class="section-count">{{ summary()!.unreadNotifications }}</span>
          </div>

          <div
            class="notif-item"
            *ngFor="let notif of summary()!.recentNotifications"
            (click)="openNotification(notif)"
          >
            <div class="item-avatar">
              <img *ngIf="notif.sender?.avatar" [src]="notif.sender.avatar" />
              <div class="avatar-placeholder" *ngIf="!notif.sender?.avatar">
                {{ getInitials(notif.sender?.fullName) }}
              </div>
            </div>
            <div class="item-content">
              <div class="item-top">
                <span class="item-name">{{ notif.title }}</span>
                <span class="item-time">{{ notif.createdAt | jalaliDate: 'HH:mm' }}</span>
              </div>
              <p class="item-text">{{ notif.message }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="notif-footer" *ngIf="summary() && summary()!.totalUnread > 0">
        <button class="btn-view-all" (click)="goToSupport()">
          مشاهده همه
          <mat-icon>arrow_back</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .notif-panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        width: 380px;
        max-height: 480px;
        background: var(--bg-card, #fff);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideDown 0.2s ease;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .notif-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border-color, #e2e8f0);
      }

      .notif-title {
        display: flex;
        align-items: center;
        gap: 8px;

        mat-icon {
          color: #6366f1;
          font-size: 20px;
        }
        h4 {
          margin: 0;
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--text-primary, #0f172a);
        }
      }

      .btn-mark-all {
        display: flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: none;
        color: #6366f1;
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 8px;
        transition: background 0.15s;

        &:hover {
          background: rgba(99, 102, 241, 0.08);
        }
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .notif-loading,
      .notif-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        color: var(--text-muted, #94a3b8);
        gap: 8px;

        mat-icon {
          font-size: 36px;
          width: 36px;
          height: 36px;
          opacity: 0.5;
        }
        p {
          margin: 0;
          font-size: 0.85rem;
        }
      }

      .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--border-color, #e2e8f0);
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .notif-content {
        flex: 1;
        overflow-y: auto;
      }

      .notif-section {
        &:not(:last-child) {
          border-bottom: 1px solid var(--border-color, #e2e8f0);
        }
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: var(--bg-secondary, #f8fafc);
      }

      .section-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;

        &.msg-icon {
          color: #6366f1;
        }
        &.notif-icon {
          color: #f59e0b;
        }
      }

      .section-title {
        flex: 1;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .section-count {
        font-size: 0.7rem;
        font-weight: 700;
        color: #fff;
        background: #6366f1;
        padding: 1px 8px;
        border-radius: 99px;
      }

      .notif-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 16px;
        cursor: pointer;
        transition: background 0.15s;

        &:hover {
          background: var(--bg-secondary, #f8fafc);
        }
        &:not(:last-child) {
          border-bottom: 1px solid rgba(0, 0, 0, 0.04);
        }
      }

      .item-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(99, 102, 241, 0.08);

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .avatar-placeholder {
        font-size: 0.75rem;
        font-weight: 700;
        color: #6366f1;
      }

      .item-content {
        flex: 1;
        min-width: 0;
      }

      .item-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .item-name {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-primary, #0f172a);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-time {
        font-size: 0.7rem;
        color: var(--text-muted, #94a3b8);
        white-space: nowrap;
      }

      .item-text {
        margin: 2px 0 0;
        font-size: 0.78rem;
        color: var(--text-secondary, #64748b);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-badge {
        font-size: 0.65rem;
        font-weight: 700;
        color: #fff;
        background: #ef4444;
        min-width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 99px;
        padding: 0 6px;
        flex-shrink: 0;
      }

      .btn-see-all,
      .btn-view-all {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 100%;
        padding: 10px;
        border: none;
        background: none;
        color: #6366f1;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;

        &:hover {
          background: rgba(99, 102, 241, 0.05);
        }
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .notif-footer {
        padding: 8px 16px;
        border-top: 1px solid var(--border-color, #e2e8f0);
      }

      /* Dark mode */
      :host-context([data-theme='dark']) {
        .notif-panel {
          background: #1e293b;
          border-color: rgba(255, 255, 255, 0.08);
        }
        .notif-header,
        .notif-footer {
          border-color: rgba(255, 255, 255, 0.08);
        }
        .notif-title h4 {
          color: #f1f5f9;
        }
        .section-header {
          background: rgba(255, 255, 255, 0.03);
        }
        .section-title {
          color: #94a3b8;
        }
        .item-name {
          color: #f1f5f9;
        }
        .item-text {
          color: #94a3b8;
        }
        .item-time {
          color: #64748b;
        }
        .notif-item:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .btn-view-all,
        .btn-see-all {
          color: #818cf8;
        }
      }
    `,
  ],
})
export class NotificationPanelComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  /** Use shared signal from SocketService instead of direct API call */
  get summary() { return this.socketService.unreadSummary; }
  isLoading = signal(true);

  constructor(
    private api: ApiService,
    public authService: AuthService,
    private socketService: SocketService,
    private notificationService: NotificationService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    // ⚠️ FIX: همیشه تازه‌سازی — قبلاً فقط بار اول لود می‌شد و پنل داده کهنه نشان می‌داد
    this.loadSummary();
  }

  loadSummary(): void {
    this.isLoading.set(true);
    this.api.get<any>('/messages/unread-summary').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.socketService.unreadSummary.set(res.data);
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  openConversation(convId: string): void {
    this.router.navigate(['/messages'], { queryParams: { conv: convId } });
    this.closePanel();
  }

  openNotification(notif: any): void {
    // ⚠️ FIX: علامت‌گذاری به‌عنوان خوانده‌شده هنگام کلیک
    // (قبلاً اعلان‌ها هرگز به‌صورت فردی خوانده نمی‌شدند و شمارنده صفر نمی‌شد)
    if (notif?._id && !notif.isRead) {
      this.notificationService.markAsRead(notif._id).subscribe({ error: () => {} });
      this.socketService.unreadSummary.update((s) =>
        s
          ? {
              ...s,
              totalUnread: Math.max(0, (s.totalUnread || 0) - 1),
              unreadNotifications: Math.max(0, (s.unreadNotifications || 0) - 1),
              recentNotifications: (s.recentNotifications || []).filter(
                (n: any) => n._id !== notif._id,
              ),
            }
          : s,
      );
    }

    if (notif.link) {
      this.router.navigateByUrl(notif.link);
    } else if (notif.type === 'new_message') {
      // پاسخ تیکت → صفحه پشتیبانی
      this.router.navigate(['/support']);
    } else {
      this.router.navigate(['/']);
    }
    this.closePanel();
  }

  markAllRead(): void {
    // علامت‌گذاری اعلان‌ها + مکالمات به‌عنوان خوانده‌شده
    // ⚠️ FIX: از NotificationService استفاده می‌شود تا سیگنال‌های آن هم صفر شوند
    // و خلاصه سوکت مستقل به‌روز شود (حتی اگر یکی از دو درخواست شکست بخورد)
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.socketService.unreadSummary.update((s) =>
          s
            ? {
                ...s,
                totalUnread: Math.max(0, (s.totalUnread || 0) - (s.unreadNotifications || 0)),
                unreadNotifications: 0,
                recentNotifications: [],
              }
            : s,
        );
        // بج نوار ناوبری را صفر کن
        this.socketService.unreadCount.set(0);
      },
      error: () => {},
    });

    this.api.put<any>('/messages/read-all', {}).subscribe({
      next: () => {
        this.socketService.unreadSummary.update((s) =>
          s
            ? {
                ...s,
                totalUnread: Math.max(0, (s.totalUnread || 0) - (s.unreadMessages || 0)),
                unreadMessages: 0,
                recentMessages: [],
              }
            : s,
        );
      },
      error: () => {},
    });
  }

  goToMessages(): void {
    this.closePanel();
    this.router.navigate(['/messages']);
  }

  goToSupport(): void {
    this.closePanel();
    this.router.navigate(['/support']);
  }

  closePanel(): void {
    this.close.emit();
  }

  getInitials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : parts[0][0];
  }

  /**
   * ⚠️ FIX: محتوای پیام‌ها HTML است (ادیتور غنی) — قبلاً تگ‌هایی مثل
   * <p> به‌صورت خام در پیش‌نمایش نمایش داده می‌شدند.
   * این متد تگ‌ها را حذف و متن خالص را برمی‌گرداند.
   */
  getMessagePreview(content: string | undefined | null): string {
    if (!content) return '';

    // در محیط SSR که document در دسترس نیست — حذف ساده تگ‌ها
    if (typeof document === 'undefined') {
      return content
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    }

    const temp = document.createElement('div');
    temp.innerHTML = content;
    const text = temp.textContent || temp.innerText || '';
    return text.trim().replace(/\s+/g, ' ');
  }
}
