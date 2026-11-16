import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { TenantService } from '../services/tenant.service';

export const roleGuard = (allowedRoles: string[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const tenantService = inject(TenantService);
    const router = inject(Router);
    const platformId = inject(PLATFORM_ID);

    // ⚠️ SSR: نقش کاربر در Node قابل تشخیص نیست → اجازهٔ render بده.
    // بررسی نقش در کلاینت انجام می‌شود.
    if (!isPlatformBrowser(platformId)) {
      return true;
    }

    if (!authService.isAuthenticated()) {
      router.navigate(['/auth/login']);
      return false;
    }

    const globalRole = authService.userRole();
    const tenantRole = tenantService.getCurrentTenantRole();

    // دسترسی مجاز است اگر کاربر ادمین کل باشد یا نقش او در آموزشگاه جاری جزو نقش‌های مجاز باشد
    const isAllowedGlobal =
      globalRole && (globalRole === 'admin' || allowedRoles.includes(globalRole));
    const isAllowedTenant =
      tenantRole &&
      (tenantRole === 'owner' || tenantRole === 'admin' || allowedRoles.includes(tenantRole));

    if (isAllowedGlobal || isAllowedTenant) {
      return true;
    }

    // اگر دسترسی نداشت به صفحه اصلی برود
    router.navigate(['/']);
    return false;
  };
};
