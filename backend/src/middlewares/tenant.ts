import { Request, Response, NextFunction } from 'express';
// [MULTI-TENANT-DISABLED] - این بخش موقتاً غیرفعال شده
// import Tenant from '../models/Tenant';
// import { ApiError } from '../utils/ApiError';
import { asyncHandler } from './asyncHandler';
// import { tenantStorage, TenantContext } from '../utils/tenantContext';

// [MULTI-TENANT-DISABLED] - tenant middleware کاملاً غیرفعال شده
// تمام کد اصلی در زیر کامنت شده و فقط next() فراخوانی می‌شود
export const resolveTenant = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    // [MULTI-TENANT-DISABLED] - این بخش موقتاً غیرفعال شده
    /*
    const host = req.headers.host || ''; 
    const parts = host.split('.');
    let tenant = null;
    let tenantId: string | null = null;
    // ... Priority 1-7 tenant resolution code ...
    // ... auto-create default tenant ...
    // ... inject tenant into request ...
    */

    // Multi-tenancy disabled — just pass through
    next();
  },
);
