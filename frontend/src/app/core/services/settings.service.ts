import { Injectable, signal, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { SiteSettings } from '../models/settings.model';

/**
 * 🎛️ سرویس تنظیمات سراسری سایت
 *
 * تنظیمات داینامیک را از API خوانده و در Signal کش می‌کند.
 * سایر کامپوننت‌ها (Footer, Support, Contact) از این سرویس استفاده می‌کنند.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private api = inject(ApiService);

  private settingsSignal = signal<SiteSettings | null>(null);
  private isLoadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  /** تنظیمات سایت */
  readonly settings = this.settingsSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /** ایمیل پشتیبانی */
  readonly supportEmail = () => this.settingsSignal()?.supportEmail || '';
  /** تلفن پشتیبانی */
  readonly supportPhone = () => this.settingsSignal()?.supportPhone || '';
  /** نام سایت */
  readonly siteName = () => this.settingsSignal()?.siteName || 'همایون';

  /**
   * بارگذاری تنظیمات از API
   */
  loadSettings(): Observable<SiteSettings | null> {
    // اگر قبلاً لود شده، دوباره درخواست نده
    if (this.settingsSignal()) {
      return of(this.settingsSignal());
    }

    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<SiteSettings>('/settings').pipe(
      map((res) => (res.success ? (res.data ?? null) : null)),
      tap((data) => {
        this.settingsSignal.set(data);
        this.isLoadingSignal.set(false);
      }),
      catchError((err) => {
        console.error('Settings load error:', err?.message);
        this.errorSignal.set('خطا در بارگذاری تنظیمات');
        this.isLoadingSignal.set(false);
        return of(null);
      }),
    );
  }

  /**
   * به‌روزرسانی تنظیمات (فقط ادمین)
   */
  updateSettings(data: Partial<SiteSettings>): Observable<SiteSettings | null> {
    return this.api.put<SiteSettings>('/settings', data).pipe(
      map((res) => (res.success ? (res.data ?? null) : null)),
      tap((updated) => {
        if (updated) this.settingsSignal.set(updated);
      }),
    );
  }
}
