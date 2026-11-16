import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { TenantService } from '../services/tenant.service';

/**
 * Guard to check if user is a member of the current tenant
 * Must be used after authGuard
 */
export const tenantGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const tenantService = inject(TenantService);
  const router = inject(Router);

  // First check authentication
  if (!authService.isAuthenticated()) {
    router.navigate(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  }

  // Check if user has access to current tenant
  const currentTenantId = tenantService.getTenantId();
  if (!currentTenantId || currentTenantId === 'default') {
    // Default tenant - allow access
    return true;
  }

  if (!tenantService.canAccessTenant(currentTenantId)) {
    // User is not a member of this tenant
    // Redirect to tenant selection or dashboard
    router.navigate(['/tenant/select'], {
      queryParams: { returnUrl: state.url },
    });
    return false;
  }

  return true;
};

/**
 * Guard to check if user has specific role in current tenant
 * Must be used after authGuard and tenantGuard
 */
export const tenantRoleGuard = (allowedRoles: string[]): CanActivateFn => {
  return (route, state) => {
    const authService = inject(AuthService);
    const tenantService = inject(TenantService);
    const router = inject(Router);

    // First check authentication
    if (!authService.isAuthenticated()) {
      router.navigate(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    }

    // Check tenant membership
    const currentTenantId = tenantService.getTenantId();
    if (!currentTenantId || currentTenantId === 'default') {
      return true;
    }

    if (!tenantService.canAccessTenant(currentTenantId)) {
      router.navigate(['/tenant/select'], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    }

    // Check role
    const userRole = tenantService.getCurrentTenantRole();
    if (!userRole || !allowedRoles.includes(userRole)) {
      // User doesn't have required role
      router.navigate(['/unauthorized']);
      return false;
    }

    return true;
  };
};

/**
 * Shortcut guards for common roles
 */
export const tenantOwnerGuard = tenantRoleGuard(['owner']);
export const tenantAdminGuard = tenantRoleGuard(['owner', 'admin']);
export const tenantInstructorGuard = tenantRoleGuard(['owner', 'admin', 'instructor']);
export const tenantStudentGuard = tenantRoleGuard(['owner', 'admin', 'instructor', 'student']);
