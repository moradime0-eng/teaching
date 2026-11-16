import { Component, OnInit, OnDestroy, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../core/services/notification.service';
import { SocketService } from '../../core/services/socket.service';
import {
  Notification,
  NotificationType,
  NotificationSender,
} from '../../core/models/notification.model';
import { PaginationMeta } from '../../core/models/api-response.model';
import { JalaliDatePipe } from '../../shared/pipes/jalali-date.pipe';
import { FaNumPipe } from '../../shared/pipes/fa-num.pipe';

type NotificationFilter = 'all' | 'unread';

interface TypeMeta {
  icon: string;
  cls: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, JalaliDatePipe, FaNumPipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent implements OnInit, OnDestroy {
  readonly limit = 20;

  filter = signal<NotificationFilter>('all');
  page = signal(1);
  meta = signal<PaginationMeta | null>(null);
  isLoading = signal(true);
  confirmDeleteAll = signal(false);

  /** لیست فیلترشده بر اساس تب انتخابی */
  items = computed(() => {
    const list = this.notificationService.notifications();
    return this.filter() === 'unread' ? list.filter((n) => !n.isRead) : list;
  });

  unreadCount = computed(() => this.notificationService.unreadCount());
  hasMore = computed(() => {
    const m = this.meta();
    return !!m && m.page < m.totalPages;
  });

  private isBrowser = false;
  private confirmTimeout: any;
  private readonly onNewNotification = (payload: any) => this.handleIncoming(payload);
  private readonly onUnreadCount = (payload: { count?: number }) => {
    if (typeof payload?.count === 'number') {
      this.notificationService.unreadCount.set(payload.count);
    }
  };

  constructor(
    public notificationService: NotificationService,
    private socketService: SocketService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.loadPage(1, false);

    // دریافت اعلان جدید به‌صورت لحظه‌ای
    this.socketService.on('new_notification', this.onNewNotification);
    // همگام‌سازی بج با آخرین شمارش سرور
    this.socketService.on('unread_count', this.onUnreadCount);
  }

  ngOnDestroy(): void {
    this.socketService.off('new_notification', this.onNewNotification);
    this.socketService.off('unread_count', this.onUnreadCount);
    if (this.confirmTimeout) clearTimeout(this.confirmTimeout);
  }

  loadPage(page: number, append: boolean): void {
    this.isLoading.set(true);
    this.notificationService.getNotifications(page, this.limit, append).subscribe({
      next: (res) => {
        this.page.set(page);
        this.meta.set(res.meta ?? null);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  loadMore(): void {
    if (this.isLoading() || !this.hasMore()) return;
    this.loadPage(this.page() + 1, true);
  }

  setFilter(f: NotificationFilter): void {
    if (this.filter() === f) return;
    this.filter.set(f);
    this.loadPage(1, false);
  }

  markAllRead(): void {
    if (this.unreadCount() === 0) return;
    this.notificationService.markAllAsRead().subscribe({ error: () => {} });
  }

  removeItem(event: Event, n: Notification): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(n._id).subscribe({ error: () => {} });
  }

  markRead(event: Event, n: Notification): void {
    event.stopPropagation();
    if (n.isRead) return;
    this.notificationService.markAsRead(n._id).subscribe({ error: () => {} });
  }

  /** حذف همه — با دو مرحله برای جلوگیری از حذف اشتباه */
  deleteAll(): void {
    if (!this.confirmDeleteAll()) {
      this.confirmDeleteAll.set(true);
      if (this.confirmTimeout) clearTimeout(this.confirmTimeout);
      this.confirmTimeout = setTimeout(() => this.confirmDeleteAll.set(false), 4000);
      return;
    }
    this.confirmDeleteAll.set(false);
    if (this.confirmTimeout) clearTimeout(this.confirmTimeout);
    this.notificationService.deleteAll().subscribe({ error: () => {} });
  }

  /** باز کردن اعلان: علامت خوانده + ناوبری */
  open(n: Notification): void {
    if (!n.isRead) {
      this.notificationService.markAsRead(n._id).subscribe({ error: () => {} });
    }
    if (n.link) {
      this.router.navigateByUrl(n.link);
    } else if (n.type === NotificationType.NEW_MESSAGE) {
      this.router.navigate(['/support']);
    } else {
      this.router.navigate(['/']);
    }
  }

  trackById(_i: number, n: Notification): string {
    return n._id;
  }

  typeMeta(type: NotificationType | string): TypeMeta {
    switch (type) {
      case NotificationType.PAYMENT:
        return { icon: 'credit_card', cls: 't-indigo' };
      case NotificationType.ENROLLMENT:
        return { icon: 'school', cls: 't-teal' };
      case NotificationType.REVIEW:
        return { icon: 'star', cls: 't-amber' };
      case NotificationType.COURSE_APPROVED:
        return { icon: 'verified', cls: 't-green' };
      case NotificationType.COURSE_REJECTED:
        return { icon: 'cancel', cls: 't-red' };
      case NotificationType.QA_QUESTION:
        return { icon: 'help_outline', cls: 't-purple' };
      case NotificationType.QA_REPLY:
        return { icon: 'reply', cls: 't-purple' };
      case NotificationType.NEW_MESSAGE:
        return { icon: 'mail', cls: 't-blue' };
      case NotificationType.COURSE_UPDATE:
        return { icon: 'update', cls: 't-slate' };
      default:
        return { icon: 'campaign', cls: 't-rose' };
    }
  }

  senderName(n: Notification): string | null {
    const s = n.sender as NotificationSender | string | undefined;
    if (s && typeof s === 'object') return s.fullName || null;
    return null;
  }

  senderAvatar(n: Notification): string | null {
    const s = n.sender as NotificationSender | string | undefined;
    if (s && typeof s === 'object') return s.avatar || null;
    return null;
  }

  senderInitial(n: Notification): string {
    const name = this.senderName(n);
    return name ? name.trim().charAt(0) : 'ن';
  }

  /** اعلان لحظه‌ای از سوکت */
  private handleIncoming(payload: any): void {
    if (!payload?._id) return;
    const exists = this.notificationService.notifications().some((n) => n._id === payload._id);
    if (exists) return;
    this.notificationService.notifications.update((list) => [payload, ...list]);
  }
}
