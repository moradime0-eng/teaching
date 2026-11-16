import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // ⚠️ SSR: در Node وضعیت احراز هویت قابل تشخیص نیست
  // (نه localStorage داریم، نه کوکی httpOnly در دسترس است).
  // اگر اینجا redirect کنیم، سرور برای مسیرهای محافظت‌شده 302 می‌دهد
  // و کاربر مستقیم به صفحهٔ لاگین منتقل می‌شود.
  // راه‌حل: در SSR اجازهٔ render بده → کلاینت بعد از بوت‌استرپ وضعیت را چک می‌کند.
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
  return false;
};