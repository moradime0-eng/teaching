import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { Campaign, ActiveCampaignResponse } from '../models/campaign.model';

/**
 * 🎯 Campaign Service
 *
 * Manages the active global discount campaign.
 * Fetches from /campaigns/active endpoint, caches in signal.
 * Provides countdown timer support via serverTime offset.
 * Handles dismiss state in localStorage (SSR-safe).
 */
@Injectable({ providedIn: 'root' })
export class CampaignService {
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);

  private activeCampaignSignal = signal<Campaign | null>(null);
  /** offset = localTime - serverTime (ms) ⇒ serverTime = Date.now() - offset */
  private serverTimeOffsetSignal = signal<number>(0);
  private lastFetchSignal = signal<number>(0);
  private isLoadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);
  /**
   * ⚠️ FIX: آیدی کمپین‌هایی که کاربر دستی حذف (dismiss) کرده است.
   * قبلاً فقط در localStorage ذخیره می‌شد و هیچ signal ای update نمی‌شد،
   * بنابراین بنر تا reload مخفی نمی‌شد. با این signal، بنر بلافاصله
   * در همهٔ صفحات ناپدید می‌شود.
   */
  private dismissedIdsSignal = signal<Set<string>>(new Set<string>());

  /** Currently active campaign (if any) */
  readonly activeCampaign = this.activeCampaignSignal.asReadonly();
  /** Server time offset for countdown (localTime - serverTime) */
  readonly serverTimeOffset = this.serverTimeOffsetSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Check if a campaign is currently active and not dismissed
   * ⚠️ FIX: باید computed signal باشد (نه arrow function) تا
   * computed هایی که آن را مصرف می‌کنند، تغییرات را track کنند.
   */
  readonly hasActiveCampaign = computed(() => {
    const campaign = this.activeCampaignSignal();
    if (!campaign) return false;
    // ⚠️ FIX: offset = localTime - serverTime ⇒ serverTime = Date.now() - offset
    const now = Date.now() - this.serverTimeOffsetSignal();
    const startAt = new Date(campaign.startAt).getTime();
    const endAt = new Date(campaign.endAt).getTime();
    return now >= startAt && now < endAt && !this.isDismissed(campaign._id);
  });

  /**
   * آیا بنر کمپین باید در حال حاضر نمایش داده شود؟
   * (کمپین فعال است و کاربر آن را حذف نکرده)
   */
  readonly shouldShowBanner = computed(() => this.hasActiveCampaign());

  /** Remaining time in milliseconds for the active campaign */
  readonly remainingTime = () => {
    const campaign = this.activeCampaignSignal();
    if (!campaign) return 0;
    // ⚠️ FIX: offset = localTime - serverTime ⇒ serverTime = Date.now() - offset
    const now = Date.now() - this.serverTimeOffsetSignal();
    const endAt = new Date(campaign.endAt).getTime();
    return Math.max(0, endAt - now);
  };

  /** Format remaining time as DD:HH:MM:SS */
  readonly formattedRemainingTime = () => {
    const ms = this.remainingTime();
    if (ms <= 0) return '00:00:00:00';
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Load active campaign from API
   * Caches for 60 seconds in-memory
   */
  loadActiveCampaign(): Observable<Campaign | null> {
    const now = Date.now();
    // Cache for 60 seconds (even when the result is null → avoids hammering the API)
    if (now - this.lastFetchSignal() < 60_000 && this.lastFetchSignal() > 0) {
      return of(this.activeCampaignSignal());
    }

    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<ActiveCampaignResponse>('/campaigns/active').pipe(
      map((res) => {
        const campaign = res.success ? (res.data?.campaign ?? null) : null;
        if (res.data?.serverTime) {
          // serverTime is in milliseconds (Unix timestamp)
          this.serverTimeOffsetSignal.set(Date.now() - res.data.serverTime);
        }
        return campaign;
      }),
      tap((campaign) => {
        this.activeCampaignSignal.set(campaign);
        this.lastFetchSignal.set(now);
        this.isLoadingSignal.set(false);
        // ⚠️ FIX: وضعیت‌های «حذف‌شده» ذخیره‌شده در localStorage را به signal
        // منتقل کن تا اگر کاربر در بار قبلی بنر را حذف کرده بود،
        // در این بار هم بنر نمایش داده نشود.
        this.hydrateDismissedIds();
      }),
      catchError((err) => {
        console.error('Campaign load error:', err?.message);
        this.errorSignal.set('خطا در بارگذاری کمپین');
        this.isLoadingSignal.set(false);
        return of(null);
      }),
    );
  }

  /**
   * انتقال وضعیت حذف‌ها از localStorage به signal (فقط در مرورگر)
   */
  private hydrateDismissedIds(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const ids: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('campaign_dismissed_')) continue;
        if (localStorage.getItem(key) !== 'true') continue;
        ids.push(key.replace('campaign_dismissed_', ''));
      }
      if (ids.length === 0) return;
      this.dismissedIdsSignal.update((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.add(id));
        return next;
      });
    } catch {
      // ignore
    }
  }

  /**
   * Check if campaign was dismissed by user (SSR-safe)
   * ⚠️ FIX: علاوه بر localStorage، از signal هم استفاده می‌شود تا
   * وضعیت حذف، reactive باشد و computed ها دوباره محاسبه شوند.
   */
  isDismissed(campaignId: string): boolean {
    // signal (reactive) — منبع حقیقت در حین اجرا
    if (this.dismissedIdsSignal().has(campaignId)) return true;
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      return localStorage.getItem(`campaign_dismissed_${campaignId}`) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Dismiss campaign for this user (SSR-safe)
   * ⚠️ FIX: علاوه بر localStorage، signal را هم update می‌کند تا بنر
   * بلافاصله (بدون نیاز به reload) در همهٔ صفحات مخفی شود.
   */
  dismiss(campaignId: string): void {
    // ۱) به‌روزرسانی reactive (برای hide فوری در همهٔ صفحات)
    this.dismissedIdsSignal.update((ids) => {
      const next = new Set(ids);
      next.add(campaignId);
      return next;
    });

    // ۲) ماندگاری روی مرورگر (برای بارهای بعدی صفحه)
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(`campaign_dismissed_${campaignId}`, 'true');
    } catch {
      // Ignore localStorage errors (private browsing, etc.)
    }
  }

  /**
   * بازگرداندن بنر حذف‌شده (اختیاری — برای تست یا بازگشت کاربر)
   */
  undismiss(campaignId: string): void {
    this.dismissedIdsSignal.update((ids) => {
      const next = new Set(ids);
      next.delete(campaignId);
      return next;
    });
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.removeItem(`campaign_dismissed_${campaignId}`);
    } catch {
      // ignore
    }
  }

  /**
   * Force refresh the campaign (e.g., on route change / poll).
   * ⚠️ FIX: باید in-memory cache را هم دور بریزد، وگرنه پاسخ کهنه برمی‌گردد.
   */
  refresh(): Observable<Campaign | null> {
    this.lastFetchSignal.set(0);
    this.activeCampaignSignal.set(null);
    return this.loadActiveCampaign();
  }
}
