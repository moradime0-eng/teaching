import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'خطای داخلی سرور رخ داده است';

  // خطاهای Mongoose CastError (آیدی نامعتبر)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `شناسه نامعتبر است: ${err.value}`;
  }

  // خطای تکراری بودن فیلد (Duplicate Key)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'فیلد';
    message = `این ${field} قبلاً ثبت شده است`;
  }

  // خطای اعتبارسنجی Mongoose
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e: any) => e.message)
      .join('، ');
  }

  // خطای توکن منقضی یا نامعتبر JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'توکن احراز هویت نامعتبر یا منقضی شده است';
  }

  // ✅ فقط خطاهای ۵۰۰ (باگ‌های سرور) استک‌تریس چاپ کنند، نه ۴۰۱ یا ۴۰۴ های عادی!
  if (statusCode >= 500) {
    console.error(`💥 [ServerError 500] ${req.method} ${req.originalUrl}:`, err);
  } else if (process.env.NODE_ENV === 'development' && statusCode !== 401 && statusCode !== 404) {
    // خطاهای ۴۰۰ یا ۴۰۳ به صورت تک‌خطی و خلاصه در حالت توسعه لاگ شوند
    console.warn(`⚠️ [ClientError ${statusCode}] ${req.method} ${req.originalUrl} - ${message}`);
  }

  // 🔒 در production پیام خطاهای داخلی (5xx) به کاربر نمایش داده نمی‌شود
  const isProduction = process.env.NODE_ENV === 'production';
  if (statusCode >= 500 && isProduction) {
    message = 'خطای داخلی سرور رخ داده است';
  }

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    ...(err.errors ? { errors: err.errors } : {}),
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 ? { stack: err.stack } : {}),
  });
};

/**
 * مدیریت روت‌های یافت‌نشده (404)
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new ApiError(404, `مسیر یافت نشد: ${req.method} ${req.originalUrl}`);
  next(error);
};