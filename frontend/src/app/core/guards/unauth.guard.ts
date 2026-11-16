import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const unauthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // ⚠️ SSR: وضعیت احراز هویت در Node قابل تشخیص نیست
  // → اجازهٔ render بده تا redirect اشتباه رخ ندهد.
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  if (authService.isAuthenticated()) {
    router.navigate(['/']);
    return false;
  }

  return true;
};