import { Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Observable, tap } from 'rxjs';
import { Notification } from '../models/notification.model';
import { ApiResponse, PaginatedResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  isLoading = signal(false);

  constructor(private api: ApiService) {}

  /**
   * دریافت لیست اعلان‌ها
   * @param append در صورت true به لیست فعلی اضافه می‌شود (صفحه‌بندی «بارگذاری بیشتر»)
   */
  getNotifications(
    page = 1,
    limit = 20,
    append = false,
  ): Observable<PaginatedResponse<Notification>> {
    this.isLoading.set(true);
    return this.api.getPaginated<Notification>('/notifications', { page, limit }).pipe(
      tap((res) => {
        if (res.data) {
          this.notifications.update((list) => (append ? [...list, ...res.data] : res.data));
        }
        // ⚠️ FIX: شمارنده از پاسخ سرور پر می‌شود (قبلاً هرگز ست نمی‌شد)
        if (typeof (res as any).unreadCount === 'number') {
          this.unreadCount.set((res as any).unreadCount);
        }
        this.isLoading.set(false);
      }),
    );
  }

  markAsRead(id: string): Observable<ApiResponse<Notification>> {
    // ⚠️ FIX: فقط اگر اعلان محلی هنوز خوانده‌نشده باشد شمارنده کم می‌شود
    // (جلوگیری از کسر تکراری برای اعلان‌های قبلاً خوانده‌شده)
    const local = this.notifications().find((n) => n._id === id);
    const shouldDecrement = !local || !local.isRead;

    return this.api.put<Notification>(`/notifications/${id}/read`, {}).pipe(
      tap(() => {
        if (shouldDecrement) {
          this.unreadCount.update((c) => Math.max(0, c - 1));
        }
        this.notifications.update((list) =>
          list.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
        );
      }),
    );
  }

  markAllAsRead(): Observable<ApiResponse<null>> {
    return this.api.put<null>('/notifications/read-all', {}).pipe(
      tap(() => {
        this.unreadCount.set(0);
        this.notifications.update((list) => list.map((n) => ({ ...n, isRead: true })));
      }),
    );
  }

  deleteNotification(id: string): Observable<ApiResponse<null>> {
    const local = this.notifications().find((n) => n._id === id);
    const wasUnread = !!local && !local.isRead;

    return this.api.delete<null>(`/notifications/${id}`).pipe(
      tap(() => {
        if (wasUnread) {
          this.unreadCount.update((c) => Math.max(0, c - 1));
        }
        this.notifications.update((list) => list.filter((n) => n._id !== id));
      }),
    );
  }

  /** حذف همه اعلان‌های کاربر */
  deleteAll(): Observable<ApiResponse<null>> {
    return this.api.delete<null>('/notifications/all').pipe(
      tap(() => {
        this.notifications.set([]);
        this.unreadCount.set(0);
      }),
    );
  }
}
