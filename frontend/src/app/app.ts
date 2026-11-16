import { Component, OnInit, effect, inject, computed, signal, OnDestroy, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { LoadingSpinnerComponent } from './shared/components/loading-spinner/loading-spinner.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { loadingState } from './core/interceptors/loading.interceptor';
import { TenantService } from './core/services/tenant.service';
import { SocketService } from './core/services/socket.service';
import { AuthService } from './core/services/auth.service';
import { ActivitySnackbarComponent } from './shared/components/activity-snackbar/activity-snackbar.component';
import { CampaignBannerComponent } from './shared/components/campaign-banner/campaign-banner.component';
import { CampaignService } from './core/services/campaign.service';
import { GlobalTicketWidgetComponent } from './shared/components/global-ticket-widget/global-ticket-widget.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavbarComponent,
    FooterComponent,
    LoadingSpinnerComponent,
    ToastComponent,
    ActivitySnackbarComponent,
    CampaignBannerComponent,
    GlobalTicketWidgetComponent,
  ],
  template: `
    <!-- ⚠️ FIX: بنر و نوار بالای سایت داخل یک wrapper چسبان (sticky) قرار می‌گیرند.
         قبلاً هر دو جداگانه sticky بودند و چون هر دو top:0 داشتند، روی هم
         می‌افتادند و navbar زیر بنر گم می‌شد. -->
    <div class="sticky-header">
      @if (shouldShowBanner()) {
        <app-campaign-banner></app-campaign-banner>
      }
      <app-navbar></app-navbar>
    </div>
    <app-activity-snackbar></app-activity-snackbar>
    <app-loading-spinner
      *ngIf="isLoading"
      class="global-loading-indicator"
      [overlay]="false"
      [diameter]="24"
      message="در حال ارتباط با سرور..."
    ></app-loading-spinner>
    <main class="main-content" [class.full-page]="isFullPage()">
      <router-outlet></router-outlet>
    </main>
    @if (!isFullPage()) {
      <app-footer></app-footer>
    }
    <app-toast></app-toast>
    <!-- Global Floating Ticket Widget -->
    <app-global-ticket-widget></app-global-ticket-widget>
  `,
  styles: [
    `
      .global-loading-indicator {
        position: fixed;
        bottom: 1rem;
        left: 1rem;
        z-index: 10000;
        pointer-events: none;
      }

      .sticky-header {
        position: sticky;
        top: 0;
        z-index: 1001;
        width: 100%;
      }

      .main-content {
        min-height: calc(100vh - 64px - 300px);
      }
      .main-content.full-page {
        min-height: auto;
      }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  /** ⚠️ FIX: باید signal باشد تا computed آن را track کند */
  readonly isFullPage = signal(false);
  private router = inject(Router);
  private campaignService = inject(CampaignService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private campaignPollInterval?: any;

  /**
   * Determine if campaign banner should be shown.
   *
   * ⚠️ تغییر: بنر کمپین اکنون روی **همهٔ صفحات** بالای نوار بالای سایت
   * نمایش داده می‌شود (نه فقط صفحهٔ خانه).
   * حذف دستی (دکمهٔ ×) در همهٔ صفحات کار می‌کند و تا پایان کمپین بسته می‌ماند.
   */
  shouldShowBanner = computed(() => {
    // فقط کمپینِ فعال و «حذف‌نشده» نمایش داده می‌شود.
    // منطق «کاربر این کمپین را حذف کرده» داخل سرویس مدیریت می‌شود.
    return this.campaignService.hasActiveCampaign();
  });

  constructor(
    private tenantService: TenantService,
    private socketService: SocketService,
  ) {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        // ✅ FIX #7: پوشش کاتالوگ و صفحه جزئیات با یک startsWith
        const url = event.urlAfterRedirects.split('?')[0].split('#')[0];
        this.isFullPage.set(url.startsWith('/learning-paths'));

        // ⚠️ FIX: کمپین جدید ممکن است در حین کار با سایت ساخته شود
        // → در هر تغییر مسیر، وضعیت کمپین دوباره بررسی شود
        this.refreshCampaign();
      });

    effect(() => {
      const isAuth = this.authService.isAuthenticated();
      if (isAuth) {
        this.socketService.connect();
      } else {
        this.socketService.disconnect();
      }
    });
  }

  ngOnInit(): void {
    // ⚠️ FIX: کمپین باید اینجا بارگذاری شود، نه فقط داخل کامپوننت بنر.
    // قبلاً بنر خودش را render نمی‌کرد (چون activeCampaign خالی بود)
    // → پس هرگز loadActiveCampaign() صدا زده نمی‌شد → بنر برای همیشه مخفی می‌ماند.
    this.refreshCampaign();

    // ⚠️ SSR-SAFE: در Node نباید setInterval ساخته شود.
    // هر macroTask باز (setInterval/setTimeout) باعث می‌شود Zone هرگز stable نشود
    // و چون Angular SSR منتظر پایداری اپ می‌ماند، رندر سمت سرور برای همیشه
    // hang می‌کند → خطای "[vite] Internal server error: Request for / was aborted".
    if (!isPlatformBrowser(this.platformId)) return;

    // بررسی دوره‌ای تا کمپین تازه‌ساخته‌شده سریع‌تر نمایش داده شود
    this.campaignPollInterval = setInterval(() => this.refreshCampaign(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.campaignPollInterval) clearInterval(this.campaignPollInterval);
  }

  /** بارگذاری/به‌روزرسانی وضعیت کمپین فعال */
  private refreshCampaign(): void {
    if (typeof window === 'undefined') return; // SSR
    this.campaignService.refresh().subscribe();
  }

  get isLoading(): boolean {
    return loadingState.getValue();
  }
}