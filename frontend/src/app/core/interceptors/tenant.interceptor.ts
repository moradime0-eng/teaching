import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TenantService } from '../services/tenant.service';

export const tenantInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const tenantService = inject(TenantService);

  // Get current tenant ID from service
  const tenantId = tenantService.getTenantId();

  // If we have a tenant, add X-Tenant-ID header
  if (tenantId && tenantId !== 'default') {
    const tenantReq = req.clone({
      setHeaders: { 'X-Tenant-ID': tenantId },
    });
    return next(tenantReq);
  }

  return next(req);
};
