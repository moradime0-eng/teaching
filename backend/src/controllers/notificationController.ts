import { Request, Response } from 'express';
import Notification, { INotification } from '../models/Notification';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { NotificationType } from '../types';
import { getIO } from '../config/socket';

/**
 * ارسال تعداد اعلان‌های خوانده‌نشده به همه تب‌های کاربر (به‌روزرسانی بج نوار ناوبری)
 * @param recipient شناسه گیرنده
 * @param countOverride اگر مقدار از قبل معلوم است (مثلاً بعد از «خواندن همه» = 0) پاسکال شود
 */
const emitUnreadCount = async (recipient: string, countOverride?: number): Promise<void> => {
  try {
    const io = getIO();
    const count =
      countOverride ?? (await Notification.countDocuments({ recipient, isRead: false }));
    io.to(`user:${recipient}`).emit('unread_count', { count });
  } catch {
    // Socket یا دیتابیس در دسترس نیست — نوتیفیکیشن هرگز نباید متوقف شود
  }
};

// Helper: create & push notification (بهترین-تلاش: خطاها هرگز جریان اصلی را نمی‌شکنند)
export const createNotification = async (data: {
  recipient: string;
  sender?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: object;
  link?: string;
  tenant?: string;
}): Promise<INotification | null> => {
  let notification: INotification | null = null;

  try {
    notification = await Notification.create(data);
  } catch (error) {
    console.error('❌ خطا در ایجاد نوتیفیکیشن:', error);
    return null;
  }

  // Push via Socket.IO
  try {
    const io = getIO();
    // ارسال با sender پرشده تا فرانت‌اند بتواند آواتار/نام را نمایش دهد
    try {
      await notification.populate('sender', 'fullName avatar');
    } catch {
      // populate اختیاری است
    }
    io.to(`user:${data.recipient}`).emit('new_notification', notification);
  } catch {
    // Socket not initialized, skip real-time push
  }

  // به‌روزرسانی بج نوار ناوبری (همه تب‌های کاربر)
  await emitUnreadCount(data.recipient);

  return notification;
};

export const getMyNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { page, limit, skip } = getPaginationOptions(req, 20);

  const filter: Record<string, any> = { recipient: req.user._id };
  if (req.query.isRead !== undefined) {
    filter.isRead = req.query.isRead === 'true';
  }

  const notifications = await Notification.find(filter)
    .populate('sender', 'fullName avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  return res.status(200).json({
    success: true,
    data: notifications,
    unreadCount,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: req.user._id },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true },
  );

  if (!notification) throw ApiError.notFound('اعلان یافت نشد');

  // به‌روزرسانی بج نوار ناوبری در همه تب‌ها
  void emitUnreadCount(req.user._id.toString());

  return ApiResponse.success(res, notification, 'اعلان خوانده شد');
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  // بعد از خواندن همه، شمارنده صفر است — بدون کوئری اضافه ارسال می‌شود
  void emitUnreadCount(req.user._id.toString(), 0);

  return ApiResponse.success(res, null, 'تمام اعلان‌ها خوانده شدند');
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const notification = await Notification.findOneAndDelete({
    _id: id,
    recipient: req.user._id,
  });

  if (!notification) throw ApiError.notFound('اعلان یافت نشد');

  void emitUnreadCount(req.user._id.toString());

  return ApiResponse.success(res, null, 'اعلان حذف شد');
});

export const deleteAllNotifications = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  await Notification.deleteMany({ recipient: req.user._id });

  void emitUnreadCount(req.user._id.toString(), 0);

  return ApiResponse.success(res, null, 'تمام اعلان‌ها حذف شدند');
});