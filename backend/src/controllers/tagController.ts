import { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import Course from '../models/Course';
import { ApiResponse } from '../utils/ApiResponse';

/**
 * 🏷️ کنترلر تگ‌ها
 *
 * GET /api/v1/tags/popular  → ۲۰ تگ پراستفاده
 */

/**
 * دریافت محبوب‌ترین تگ‌ها
 * با استفاده از aggregation روی field tags در دوره‌های منتشر شده
 */
export const getPopularTags = asyncHandler(async (_req: Request, res: Response) => {
  const tags = await Course.aggregate([
    { $match: { status: 'published', tags: { $exists: true, $not: { $size: 0 } } } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
    { $project: { _id: 0, name: '$_id', count: 1 } },
  ]);

  ApiResponse.success(res, tags, 'تگ‌های محبوب با موفقیت دریافت شد');
});
