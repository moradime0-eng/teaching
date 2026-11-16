// [MULTI-TENANT-DISABLED] - این کنترلر مخصوص مولتی‌تنت است و غیرفعال شده
import { Request, Response } from 'express';
import Tenant from '../models/Tenant';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';

export const getTenantBranding = asyncHandler(async (req: Request, res: Response) => {
  const host = (req.query.host as string) || req.headers.host || '';
  const parts = host.split('.');

  let tenant = null;

  // ۱. بررسی بر اساس دامنه اختصاصی (localhost را فیلتر می‌کنیم تا تداخل ایجاد نشود)
  const isMainDomain = host.includes('localhost') || host.includes('iranianudemy.com');

  if (!isMainDomain) {
    tenant = await Tenant.findOne({ customDomain: host, isActive: true });
  }

  // ۲. بررسی بر اساس ساب‌دامین
  if (!tenant && parts.length >= 3) {
    const subdomain = parts[0].toLowerCase();
    if (subdomain !== 'www' && subdomain !== 'api') {
      tenant = await Tenant.findOne({ subdomain, isActive: true });
    }
  }

  // ۳. در صورتی که تننت اختصاصی یافت نشد، اولین تننت فعال یا تننت مادر را برمی‌گردانیم
  if (!tenant) {
    tenant = await Tenant.findOne({ isActive: true });
  }

  // ۴. اگر هنوز هیچ تننتی در دیتابیس ساخته نشده بود، مقادیر قالب پیش‌فرض پلتفرم را برمی‌گردانیم
  if (!tenant) {
    return ApiResponse.success(res, {
      name: 'آموزش همایون',
      logo: '/assets/images/logo.png',
      branding: {
        primaryColor: '#a435f0',
        secondaryColor: '#1c1d1f',
        fontFamily: 'Vazirmatn',
      },
    });
  }

  return ApiResponse.success(res, tenant);
});
