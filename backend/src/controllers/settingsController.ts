import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import Setting from '../models/Setting';
import { ApiResponse } from '../utils/ApiResponse';
import { invalidateCache } from '../middlewares/cache';

/**
 * 🎛️ کنترلر تنظیمات سراسری سیستم
 *
 * GET /api/v1/settings  → عمومی (عمومی)
 * PUT /api/v1/settings  → ادمین (به‌روزرسانی)
 */

/**
 * دریافت تنظیمات سایت (عمومی)
 */
export const getSettings = asyncHandler(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const settings = await Setting.getSettings();
    ApiResponse.success(res, settings, 'تنظیمات با موفقیت دریافت شد');
  },
);

/**
 * به‌روزرسانی تنظیمات سایت (فقط ادمین)
 */
export const updateSettings = asyncHandler(
  async (req: Request, res: Response, _next: NextFunction) => {
    const allowedFields = [
      'siteName',
      'siteDescription',
      'supportEmail',
      'supportPhone',
      'address',
      'workingHours',
      'socialLinks',
      'seo',
      'logo',
      'favicon',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const settings = await Setting.findByIdAndUpdate(
      'global_settings_singleton',
      { $set: updateData },
      { new: true, upsert: true, runValidators: true },
    );

    // Invalidate settings cache
    await invalidateCache([`cache:*settings*`]);

    ApiResponse.success(res, settings, 'تنظیمات با موفقیت به‌روزرسانی شد');
  },
);
