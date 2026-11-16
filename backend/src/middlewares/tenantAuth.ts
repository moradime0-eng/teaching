import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from './asyncHandler';
// [MULTI-TENANT-DISABLED] - این بخش موقتاً غیرفعال شده
// import Membership, { MembershipRole, MembershipStatus } from '../models/Membership';
// import { getCurrentTenantId, isSuperAdmin } from '../utils/tenantContext';

// [MULTI-TENANT-DISABLED] - تمام middleware های tenant auth غیرفعال شده
// تمام توابع فقط next() فراخوانی می‌کنند

export interface TenantAuthOptions {
  roles?: any[];
  status?: any;
  allowSuperAdmin?: boolean;
  hasPermission?: (membership: any, req: Request) => boolean;
}

export const requireTenantMembership = (options: TenantAuthOptions = {}) => {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    // [MULTI-TENANT-DISABLED] - بررسی عضویت غیرفعال شده
    next();
  });
};

export const requireTenantOwner = requireTenantMembership({});
export const requireTenantAdmin = requireTenantMembership({});
export const requireTenantInstructor = requireTenantMembership({});
export const requireTenantStudent = requireTenantMembership({});
export const requireTenantResourceAccess = (resourceModel: any, resourceParam = 'id') => {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    // [MULTI-TENANT-DISABLED] - بررسی دسترسی منبع غیرفعال شده
    next();
  });
};

// [MULTI-TENANT-DISABLED] - توابع زیر غیرفعال شده
export const requireOwnershipOrTenantRole = (allowedRoles: any[] = []) => {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    next();
  });
};

export const validateTenantSwitch = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    next();
  },
);
