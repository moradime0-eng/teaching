import { Component, ElementRef, HostListener, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { filter } from 'rxjs/operators';

import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { SocketService } from '../../../core/services/socket.service';
import { ApiService } from '../../../core/services/api.service';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';
import { TenantSwitcherComponent } from '../tenant-switcher/tenant-switcher.component';
import { MegaMenuComponent } from '../mega-menu/mega-menu.component';
import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { NotificationPanelComponent } from '../notification-panel/notification-panel.component';
import { FaNumPipe } from '../../pipes/fa-num.pipe';
import { environment } from '../../../../environments/environment.development';

/** شمارنده‌های دراپ‌داون پروفایل (GET /dashboard/quick-stats) */
interface QuickStats {
  role?: string;
  activeCourses?: number;
  wishlist?: number;
  learningPaths?: number;
  certificates?: number;
  publishedCourses?: number;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatBadgeModule,
    MatDividerModule,
    ClickOutsideDirective,
    TenantSwitcherComponent,
    MegaMenuComponent,
    ImageFallbackDirective,
    NotificationPanelComponent,
    FaNumPipe,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  private router = inject(Router);
  public authService = inject(AuthService);
  public themeService = inject(ThemeService);
  public socketService = inject(SocketService);
  private api = inject(ApiService);

  /**
   * ✅ شمارنده‌های دراپ‌داون (دوره فعال، علاقه‌مندی، مسیر یادگیری، گواهی‌نامه)
   * قبلاً در تمپلیت hardcode «۰» بودند و هرگز پر نمی‌شدند.
   */
  quickStats = signal<QuickStats | null>(null);
  private quickStatsFetchedAt = 0;
  private quickStatsInFlight = false;
  /** مدت اعتبار کش شمارنده‌ها (میلی‌ثانیه) */
  private readonly QUICK_STATS_TTL = 30_000;

  @ViewChild('desktopSearchInput') desktopSearchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('mobileSearchInput') mobileSearchInput?: ElementRef<HTMLInputElement>;

  isMobileMenuOpen = signal(false);
  isSearchOpen = signal(false);
  isScrolled = signal(false);
  isProfileMenuOpen = signal(false);
  isNotificationPanelOpen = signal(false);
  searchQuery = '';

  constructor() {
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.isMobileMenuOpen.set(false);
      this.isSearchOpen.set(false);
      this.isProfileMenuOpen.set(false);
    });
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.isScrolled.set(window.scrollY > 20);
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.desktopSearchInput?.nativeElement.focus();
    }
    if (event.key === 'Escape') {
      this.isProfileMenuOpen.set(false);
      this.isNotificationPanelOpen.set(false);
    }
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.update((v) => !v);
  }

  toggleSearch(): void {
    this.isSearchOpen.update((v) => {
      const next = !v;
      if (next) {
        setTimeout(() => this.mobileSearchInput?.nativeElement.focus(), 100);
      }
      return next;
    });
  }

  toggleProfileMenu(): void {
    this.isProfileMenuOpen.update((v) => !v);
    if (this.isProfileMenuOpen()) {
      this.loadQuickStats();
    }
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen.set(false);
  }

  /** آیا شمارنده‌ها هنوز از سرور دریافت نشده‌اند؟ (برای نمایش حالت لودینگ) */
  get statsLoading(): boolean {
    return this.quickStats() === null;
  }

  /** مقدار یک شمارنده با fallback صفر */
  statNumber(key: keyof QuickStats): number {
    const value = this.quickStats()?.[key];
    return typeof value === 'number' ? value : 0;
  }

  /**
   * دریافت شمارنده‌ها هنگام باز شدن دراپ‌داون — با کش کوتاه‌مدت
   * تا هر بار باز کردن منو باعث درخواست اضافی نشود.
   */
  private loadQuickStats(): void {
    if (!this.authService.isAuthenticated()) return;
    if (this.quickStatsInFlight) return;

    const now = Date.now();
    if (this.quickStats() && now - this.quickStatsFetchedAt < this.QUICK_STATS_TTL) {
      return;
    }

    this.quickStatsInFlight = true;
    this.api.get<QuickStats>('/dashboard/quick-stats').subscribe({
      next: (res) => {
        this.quickStatsInFlight = false;
        if (res?.data) {
          this.quickStats.set(res.data);
          this.quickStatsFetchedAt = Date.now();
        }
      },
      error: () => {
        // در صورت خطا، شمارنده‌ها رها می‌شوند تا در باز بعدی دوباره تلاش شود
        this.quickStatsInFlight = false;
        this.quickStatsFetchedAt = 0;
      },
    });
  }

  toggleNotificationPanel(): void {
    this.isNotificationPanelOpen.update((v) => !v);
    this.isProfileMenuOpen.set(false);
  }

  closeNotificationPanel(): void {
    this.isNotificationPanelOpen.set(false);
  }

  onSearch(): void {
    const query = this.searchQuery.trim();
    if (query) {
      this.router.navigate(['/courses'], { queryParams: { search: query } });
      this.isSearchOpen.set(false);
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.desktopSearchInput?.nativeElement.focus();
  }

  getUserRoleLabel(): string {
    if (this.authService.isAdmin()) return 'مدیر سیستم';
    if (this.authService.isInstructor()) return 'مدرس آکادمی';
    return 'دانشجو';
  }

  getUserInitials(): string {
    const name = this.authService.userName() || 'کاربر';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`;
    }
    return parts[0][0] || 'ک';
  }

  /**
   * ✅ متد تبدیل آدرس آواتار به لینک سرور
   * پوشش‌دهنده ساختارهای رشته‌ای، آبجکتی، آدرس‌های خارجی و Data URL
   */
  resolveAvatarUrl(raw: unknown): string | null {
    if (raw == null) return null;

    let url = '';
    if (typeof raw === 'string') {
      url = raw.trim();
    } else if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      url = String(o['url'] ?? o['path'] ?? o['secure_url'] ?? o['src'] ?? '').trim();
    }

    if (!url || url === 'null' || url === 'undefined') return null;
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) return null;

    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;

    // استفاده از پورت سوکت یا فال‌بک ۵۰۰۰ برای مدیاها
    const base = environment.socketUrl
      ? environment.socketUrl.replace(/\/$/, '')
      : window.location.origin;

    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  logout(): void {
    this.closeProfileMenu();
    // پاک‌سازی شمارنده‌ها تا آمار کاربر قبلی روی دستگاه مشترک باقی نماند
    this.quickStats.set(null);
    this.quickStatsFetchedAt = 0;
    this.authService.logout().subscribe();
  }
}
