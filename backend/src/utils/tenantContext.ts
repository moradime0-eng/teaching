import { AsyncLocalStorage } from 'async_hooks';

// [MULTI-TENANT-DISABLED] - این بخش موقتاً غیرفعال شده
/**
 * Tenant Context using AsyncLocalStorage
 * DISABLED: All tenant context functions now return undefined/null
 */

export interface TenantContext {
  tenantId?: string;
  userId?: string;
  userRole?: string;
  membershipRole?: string;
  isSuperAdmin?: boolean;
  bypassTenant?: boolean;
}

// [MULTI-TENANT-DISABLED] - AsyncLocalStorage غیرفعال شده
// export const tenantStorage = new AsyncLocalStorage<TenantContext>();
export const tenantStorage = {
  getStore: (): TenantContext | undefined => undefined,
  run: <T>(_context: TenantContext, fn: () => T): T => fn(),
};

// [MULTI-TENANT-DISABLED] - تمام توابع کانتکست غیرفعال شده
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  return fn();
}

export function getCurrentTenantId(): string | undefined {
  return undefined;
}

export function getCurrentUserId(): string | undefined {
  return undefined;
}

export function getCurrentUserRole(): string | undefined {
  return undefined;
}

export function getCurrentMembershipRole(): string | undefined {
  return undefined;
}

export function isSuperAdmin(): boolean {
  return false;
}

export function shouldBypassTenant(): boolean {
  return true; // همیشه bypass — مولتی‌تنت غیرفعال
}

export function getTenantContext(): TenantContext | undefined {
  return undefined;
}

export function withUpdatedTenantContext<T>(updates: Partial<TenantContext>, fn: () => T): T {
  return fn();
}

export function setTenantContextFromRequest(req: any, user?: any, membershipRole?: string): void {
  req.tenantContext = undefined;
}

export function clearTenantContext(): void {
  // No-op
}

export function WithTenantContext() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    return descriptor;
  };
}
