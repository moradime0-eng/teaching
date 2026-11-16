import { Component, OnInit, OnDestroy, signal, effect, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { SocketService } from '../../../core/services/socket.service';

@Component({
  selector: 'app-activity-snackbar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="snackbar-wrapper" *ngIf="visible()">
      <div class="snackbar" (click)="goToMessages()">
        <div class="snackbar-glow"></div>

        <div class="snackbar-content">
          <div class="snackbar-icon-wrap">
            <div class="icon-bg"></div>
            <mat-icon class="snackbar-icon">notifications_active</mat-icon>
          </div>

          <div class="snackbar-text">
            <span class="snackbar-title">{{ getTitle() }}</span>
            <span class="snackbar-desc">
              <span *ngIf="summary()!.unreadMessages > 0">
                {{ summary()!.unreadMessages }} پیام خوانده‌نشده
              </span>
              <span
                *ngIf="summary()!.unreadMessages > 0 && summary()!.unreadNotifications > 0"
                class="dot"
                >·</span
              >
              <span *ngIf="summary()!.unreadNotifications > 0">
                {{ summary()!.unreadNotifications }} اعلان جدید
              </span>
            </span>
          </div>

          <mat-icon class="snackbar-arrow">arrow_back</mat-icon>
        </div>

        <div class="snackbar-progress" [style.animation-duration]="autoHideSec + 's'"></div>
      </div>
    </div>
  `,
  styles: [
    `
      .snackbar-wrapper {
        position: fixed;
        top: 76px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        pointer-events: none;
      }

      .snackbar {
        position: relative;
        cursor: pointer;
        pointer-events: auto;
        animation: snackbarSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        transition:
          transform 0.2s ease,
          box-shadow 0.2s ease;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(99, 102, 241, 0.5);
        }

        &:active {
          transform: translateY(0);
        }
      }

      @keyframes snackbarSlideIn {
        from {
          opacity: 0;
          transform: translateY(-24px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .snackbar-glow {
        position: absolute;
        inset: -2px;
        border-radius: 18px;
        background: linear-gradient(135deg, #6366f1, #a855f7, #6366f1);
        background-size: 200% 200%;
        animation: glowShift 3s ease infinite;
        z-index: -1;
        opacity: 0.6;
        filter: blur(8px);
      }

      @keyframes glowShift {
        0%,
        100% {
          background-position: 0% 50%;
        }
        50% {
          background-position: 100% 50%;
        }
      }

      .snackbar-content {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 20px;
        background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6366f1 100%);
        color: #fff;
        border-radius: 16px;
        min-width: 340px;
        max-width: 460px;
        position: relative;
        overflow: hidden;
      }

      .snackbar-content::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.08) 50%,
          transparent 100%
        );
        animation: shine 3s ease-in-out infinite;
      }

      @keyframes shine {
        0% {
          left: -100%;
        }
        100% {
          left: 200%;
        }
      }

      .snackbar-icon-wrap {
        position: relative;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .icon-bg {
        position: absolute;
        inset: 0;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.15);
        animation: iconPulse 2s ease-in-out infinite;
      }

      @keyframes iconPulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.8;
        }
      }

      .snackbar-icon {
        position: relative;
        z-index: 1;
        font-size: 22px;
        width: 22px;
        height: 22px;
        color: #fff;
      }

      .snackbar-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
        position: relative;
        z-index: 1;
      }

      .snackbar-title {
        font-size: 0.88rem;
        font-weight: 700;
        letter-spacing: -0.01em;
      }

      .snackbar-desc {
        font-size: 0.76rem;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .dot {
        opacity: 0.6;
      }

      .snackbar-arrow {
        font-size: 20px;
        width: 20px;
        height: 20px;
        opacity: 0.8;
        position: relative;
        z-index: 1;
        flex-shrink: 0;
        transition: transform 0.2s;

        .snackbar:hover & {
          transform: translateX(-3px);
          opacity: 1;
        }
      }

      .snackbar-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: linear-gradient(90deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.2));
        border-radius: 0 0 16px 16px;
        animation: progressCountdown linear forwards;
        z-index: 2;
      }

      @keyframes progressCountdown {
        from {
          width: 100%;
        }
        to {
          width: 0%;
        }
      }

      :host-context([data-theme='dark']) {
        .snackbar-content {
          background: linear-gradient(135deg, #4338ca 0%, #6d28d9 50%, #4f46e5 100%);
        }
      }
    `,
  ],
})
export class ActivitySnackbarComponent implements OnInit, OnDestroy {
  visible = signal(false);
  /** Use shared signal from SocketService instead of direct API call */
  get summary() { return this.socketService.unreadSummary; }

  autoHideSec = 7;
  private isBrowser = false;
  private hideTimeout: any;
  private lastChecked = 0;
  private initialCheckDone = false;

  // ⚠️ FIX: نگه‌داشتن مرجع لیسنرها تا در ngOnDestroy فقط لیسنر خودمان حذف شود
  // (قبلاً off(event) بدون callback لیسنرهای سایر کامپوننت‌ها را هم پاک می‌کرد)
  private readonly onNewMessageNotification = () => this.checkUnread();
  private readonly onNewNotification = () => this.checkUnread();

  constructor(
    private api: ApiService,
    public authService: AuthService,
    private socketService: SocketService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);

    // گوش دادن به تغییرات وضعیت احراز هویت — فقط یکبار چک کن
    effect(() => {
      const isAuth = this.authService.isAuthenticated();
      if (isAuth && this.isBrowser && !this.initialCheckDone) {
        this.initialCheckDone = true;
        // یکبار موقع لود شدن چک کن
        setTimeout(() => this.checkUnread(), 2000);
      } else if (!isAuth) {
        this.visible.set(false);
        this.initialCheckDone = false;
        // ⚠️ FIX: ریست شمارنده تا بعد از لاگین مجدد، اعلان‌های جدید درست نمایش داده شوند
        this.lastChecked = 0;
        if (this.hideTimeout) clearTimeout(this.hideTimeout);
      }
    });
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;

    // به‌جای polling، از socket برای تشخیص پیام/اعلان جدید استفاده کن
    this.socketService.on('new_message_notification', this.onNewMessageNotification);
    this.socketService.on('new_notification', this.onNewNotification);
  }

  ngOnDestroy(): void {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.socketService.off('new_message_notification', this.onNewMessageNotification);
    this.socketService.off('new_notification', this.onNewNotification);
  }

  checkUnread(): void {
    if (!this.isBrowser) return;

    this.api.get<any>('/messages/unread-summary').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          // Update the shared signal so notification-panel also benefits
          this.socketService.unreadSummary.set(res.data);
          if (res.data.totalUnread > 0) {
            if (res.data.totalUnread !== this.lastChecked) {
              this.lastChecked = res.data.totalUnread;
              this.show();
            }
          } else {
            this.lastChecked = 0;
            this.visible.set(false);
          }
        } else {
          this.lastChecked = 0;
          this.visible.set(false);
        }
      },
    });
  }

  show(): void {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.visible.set(true);
    this.hideTimeout = setTimeout(() => {
      this.visible.set(false);
    }, this.autoHideSec * 1000);
  }

  getTitle(): string {
    const s = this.summary();
    if (!s) return '';
    if (s.unreadMessages > 0 && s.unreadNotifications > 0) return 'پیام و اعلان جدید دارید';
    if (s.unreadMessages > 0) return 'پیام خوانده‌نشده دارید';
    if (s.unreadNotifications > 0) return 'اعلان جدید دارید';
    return '';
  }

  goToMessages(): void {
    this.visible.set(false);
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.router.navigate(['/messages']);
  }
}
