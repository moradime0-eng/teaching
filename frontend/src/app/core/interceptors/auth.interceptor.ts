import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpClient,
} from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, ReplaySubject, catchError, switchMap, tap, throwError, timeout } from 'rxjs';
import { TokenService } from '../services/token.service';
import { environment } from '../../../environments/environment.development';

/**
 * جریان مشترک refresh.
 *
 * ⚠️ نکتهٔ مهم: قبلاً از BehaviorSubject با filter(token => token !== null) استفاده
 * می‌شد. اگر ۲ درخواست همزمان ۴۰۱ بگیرند، درخواست دوم منتظر می‌ماند؛ اما وقتی
 * refresh شکست بخورد فقط `null` منتشر می‌شد و شرط filter هرگز برقرار نمی‌شد
 * → درخواست دوم برای همیشه معلق ماند.
 * در SSR این یعنی Zone هرگز stable نمی‌شود و رندر با TimeoutError می‌افتد
 * (نمونه: /admin/campaigns که ۲ درخواست موازی به /campaigns و /campaigns/stats دارد).
 *
 * راه‌حل: از ReplaySubject(1) استفاده می‌کنیم که در صورت خطا با error
 * خاتمه می‌یابد — تا مشترکین دیررس بلافاصله خطا را دریافت کنند و معلق نمانند.
 */
let refreshInFlight$: ReplaySubject<string | null> | null = null;

/**
 * یک refresh را انجام می‌دهد یا به refresh در حال اجرا می‌پیوند.
 * در هر دو حالت یک Observable می‌دهد که یا توکن تازه می‌دهد یا خطا.
 */
function refreshAccessToken(
  http: HttpClient,
  tokenService: TokenService,
  router: Router,
  isBrowser: boolean,
): Observable<string | null> {
  if (refreshInFlight$) {
    return refreshInFlight$.asObservable();
  }

  const subject = new ReplaySubject<string | null>(1);
  refreshInFlight$ = subject;

  http
    .post<any>(`${environment.apiUrl}/auth/refresh-token`, {}, { withCredentials: true })
    .pipe(timeout(20000))
    .subscribe({
      next: (response: any) => {
        const newAccessToken = response?.data?.accessToken;
        if (newAccessToken) {
          // ⚠️ FIX: توکن جدید را در localStorage ذخیره کن — سوکت (socket.io)
          // هنگام اتصال همین مقدار را می‌خواند. قبلاً فقط کوکی refresh می‌شد و
          // سوکت با توکن منقضی تلاش می‌کرد → خطای مکرر "Invalid token".
          tokenService.setAccessToken(newAccessToken);
        }
        subject.next(newAccessToken ?? null);
        subject.complete();
        refreshInFlight$ = null;
      },
      error: (refreshError) => {
        tokenService.clearTokens();
        // ⚠️ فقط در مرورگر ناوبری کن — ناوبری هنگام SSR باعث پاسخ 302
        // به /auth/login (بدون returnUrl) می‌شود و صفحه را قبل از بوت‌استرپ
        // Angular به صفحه لاگین منتقل می‌کند.
        if (isBrowser) {
          router.navigate(['/auth/login']);
        }
        // خطا را به همهٔ مشترکین (از جمله درخواست‌های همزمان) برسان
        subject.error(refreshError);
        refreshInFlight$ = null;
      },
    });

  return subject.asObservable();
}

/**
 * Auth interceptor — handles authentication via httpOnly cookies.
 *
 * IMPORTANT:
 * - Do NOT inject AuthService here — it creates a circular dependency
 *   (AuthService → HttpClient → authInterceptor → AuthService → 💥).
 * - Instead, use HttpClient directly to call the refresh endpoint.
 * - All inject() calls MUST be at the top level of this function.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  // ✅ Only inject services that do NOT depend on HttpClient
  const tokenService = inject(TokenService);
  const http = inject(HttpClient);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);
  const isBrowser = isPlatformBrowser(platformId);

  // Always send withCredentials for httpOnly cookie auth
  const authReq = req.clone({ withCredentials: true });

  // Skip auth for public paths
  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh-token',
    '/auth/forgot-password',
    '/auth/reset-password',
  ];

  if (publicPaths.some((path) => req.url.includes(path))) {
    return next(authReq);
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/refresh-token')) {
        // Call refresh endpoint directly via HttpClient to avoid circular dependency.
        // درخواست‌های همزمان به یک refresh مشترک می‌پیوندند (refreshInFlight$).
        return refreshAccessToken(http, tokenService, router, isBrowser).pipe(
          switchMap(() => {
            const retryReq = req.clone({ withCredentials: true });
            return next(retryReq);
          }),
          catchError((refreshError) => throwError(() => refreshError)),
        );
      }

      return throwError(() => error);
    }),
  );
};
