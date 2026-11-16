import { Request, Response } from 'express';
import Subscriber from '../models/Subscriber';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';

// ==================== SUBSCRIBE TO NEWSLETTER ====================
export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    throw ApiError.badRequest('ایمیل الزامی است');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if already subscribed and active
  const existing = await Subscriber.findOne({ email: normalizedEmail });
  if (existing && existing.isActive) {
    return ApiResponse.success(res, null, 'شما قبلاً عضو خبرنامه شده‌اید');
  }

  // Reactivate if previously unsubscribed
  if (existing && !existing.isActive) {
    existing.isActive = true;
    existing.unsubscribedAt = undefined;
    await existing.save();
    return ApiResponse.success(res, null, 'عضویت شما مجدداً فعال شد');
  }

  await Subscriber.create({ email: normalizedEmail });
  return ApiResponse.created(res, null, 'با موفقیت عضو خبرنامه شدید');
});

// ==================== UNSUBSCRIBE ====================
export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) throw ApiError.badRequest('ایمیل الزامی است');

  const subscriber = await Subscriber.findOne({ email: email.trim().toLowerCase() });
  if (!subscriber) throw ApiError.notFound('ایمیل یافت نشد');

  subscriber.isActive = false;
  subscriber.unsubscribedAt = new Date();
  await subscriber.save();

  return ApiResponse.success(res, null, 'عضویت شما لغو شد');
});

// ==================== GET SUBSCRIBERS (Admin) ====================
export const getSubscribers = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
  const skip = (page - 1) * limit;

  const [subscribers, total] = await Promise.all([
    Subscriber.find({ isActive: true }).sort({ subscribedAt: -1 }).skip(skip).limit(limit).lean(),
    Subscriber.countDocuments({ isActive: true }),
  ]);

  return ApiResponse.paginated(res, subscribers, page, limit, total, 'لیست مشترکین');
});
