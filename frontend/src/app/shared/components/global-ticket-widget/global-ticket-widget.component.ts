import { Component, inject, signal, computed, effect, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { filter, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { QuickTicketDialogComponent } from './quick-ticket-dialog/quick-ticket-dialog.component';
interface PageContext {
  url: string;
  route: string;
  title: string;
  userRole: string;
  courseId?: string;
  lectureId?: string;
  timestamp: string;
}

@Component({
  selector: 'app-global-ticket-widget',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './global-ticket-widget.component.html',
  styleUrl: './global-ticket-widget.component.scss',
})
export class GlobalTicketWidgetComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private dialog = inject(MatDialog);
  private platformId = inject(PLATFORM_ID);

  private destroy$ = new Subject<void>();

  // Signals
  readonly isVisible = signal(false);
  readonly isLoading = signal(false);
  readonly pageContext = signal<PageContext | null>(null);

  // Computed: Check if user is student or instructor (not admin)
  readonly canShowWidget = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return false;
    const role = user.role;
    return role === 'student' || role === 'instructor';
  });

  // Computed: Check if current route is allowed
  readonly isAllowedRoute = computed(() => {
    const url = this.router.url.split('?')[0].split('#')[0];
    const forbiddenPrefixes = [
      '/auth/',
      '/admin/',
      '/instructor/register',
    ];
    return !forbiddenPrefixes.some(prefix => url.startsWith(prefix));
  });

  // Combined visibility
  readonly shouldShow = computed(() => 
    this.canShowWidget() && this.isAllowedRoute() && this.authService.isAuthenticated()
  );

  // Effect must be in constructor for injection context
  private authEffect = effect(() => {
    const isAuth = this.authService.isAuthenticated();
    const shouldShow = this.shouldShow();
    
    if (isAuth) {
      this.isVisible.set(shouldShow);
    } else {
      this.isVisible.set(false);
    }
  });

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Track route changes to update context
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.updatePageContext(event.urlAfterRedirects);
      });

    // Initial context
    this.updatePageContext(this.router.url);

    // Show widget after a short delay for better UX
    setTimeout(() => {
      this.isVisible.set(this.shouldShow());
    }, 500);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updatePageContext(url: string): void {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const route = this.extractRoute(cleanUrl);
    const title = this.getPageTitle(cleanUrl);
    const { courseId, lectureId } = this.extractIds(cleanUrl);

    this.pageContext.set({
      url: cleanUrl,
      route,
      title,
      userRole: this.authService.currentUser()?.role || 'unknown',
      courseId,
      lectureId,
      timestamp: new Date().toISOString(),
    });
  }

  private extractRoute(url: string): string {
    // Extract meaningful route name
    if (url === '/' || url === '') return 'home';
    if (url.startsWith('/course/')) return 'course-detail';
    if (url.startsWith('/learn/')) return 'classroom';
    if (url.startsWith('/dashboard/')) return 'student-dashboard';
    if (url.startsWith('/instructor/')) return 'instructor-panel';
    if (url.startsWith('/cart')) return 'cart';
    if (url.startsWith('/checkout')) return 'checkout';
    if (url.startsWith('/payment/')) return 'payment';
    if (url.startsWith('/wallet')) return 'wallet';
    if (url.startsWith('/messages')) return 'messages';
    if (url.startsWith('/support')) return 'support';
    if (url.startsWith('/courses')) return 'courses-catalog';
    if (url.startsWith('/learning-paths')) return 'learning-paths';
    if (url.startsWith('/notifications')) return 'notifications';
    return 'other';
  }

  private getPageTitle(url: string): string {
    const titles: Record<string, string> = {
      '/': 'صفحه اصلی',
      '/courses': 'دوره‌های آموزشی',
      '/learning-paths': 'مسیرهای یادگیری',
      '/dashboard/my-courses': 'دوره‌های من',
      '/dashboard/learning-paths': 'مسیرهای یادگیری من',
      '/dashboard/wishlist': 'علاقه‌مندی‌ها',
      '/dashboard/orders': 'سفارش‌ها',
      '/dashboard/profile': 'پروفایل کاربری',
      '/dashboard/certificates': 'گواهی‌نامه‌ها',
      '/instructor/dashboard': 'داشبورد مدرس',
      '/instructor/course-builder': 'سازماندهی دوره',
      '/instructor/analytics': 'تحلیل‌ها',
      '/instructor/questions': 'سوالات دانشجویان',
      '/instructor/profile': 'پروفایل مدرس',
      '/cart': 'سبد خرید',
      '/checkout': 'تسویه حساب',
      '/wallet': 'کیف پول',
      '/messages': 'پیام‌ها',
      '/support': 'پشتیبانی',
      '/notifications': 'اعلان‌ها',
    };

    // Check for dynamic routes
    if (url.startsWith('/course/')) return 'جزئیات دوره';
    if (url.startsWith('/learn/')) return 'کلاس درس';
    if (url.startsWith('/payment/success')) return 'پرداخت موفق';
    if (url.startsWith('/payment/failure')) return 'پرداخت ناموفق';
    if (url.startsWith('/instructor/course-builder/')) return 'ویرایش دوره';

    return titles[url] || 'صفحه ناشناس';
  }

  private extractIds(url: string): { courseId?: string; lectureId?: string } {
    const courseMatch = url.match(/\/course\/([^\/]+)/);
    const learnMatch = url.match(/\/learn\/([^\/]+)/);
    const lectureMatch = url.match(/\/lecture\/([^\/]+)/);

    return {
      courseId: courseMatch?.[1] || learnMatch?.[1],
      lectureId: lectureMatch?.[1],
    };
  }

  openDialog(): void {
    const context = this.pageContext();
    if (!context) return;

    const dialogRef = this.dialog.open(QuickTicketDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'quick-ticket-dialog-panel',
      data: { context },
      disableClose: false,
      autoFocus: false,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.toast.success('تیکت شما با موفقیت ثبت شد');
      }
    });
  }
}