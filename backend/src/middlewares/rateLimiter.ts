import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Development: no limit
// Production: proper rate limiting
const isDevelopment = process.env.NODE_ENV === 'development';

const createLimiter = (windowMs: number, max: number, message: string) => {
  if (isDevelopment) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General API limiter: 10000 requests per 15 minutes (increased for development)
export const generalLimiter = createLimiter(
  15 * 60 * 1000,
  10000,
  'تعداد درخواست‌ها از حد مجاز گذشته است. لطفاً بعداً تلاش کنید.',
);

// Auth endpoints: 1000 requests per 15 minutes (increased to avoid login issues)
export const authLimiter = createLimiter(
  15 * 60 * 1000,
  1000,
  'تلاش‌های ورود زیاد است. لطفاً ۱۵ دقیقه صبر کنید.',
);

// Registration: 100 requests per hour (increased)
export const registerLimiter = createLimiter(
  60 * 60 * 1000,
  100,
  'تعداد ثبت‌نام‌ها از حد مجاز گذشته است. لطفاً یک ساعت صبر کنید.',
);

// Password reset: 100 requests per 15 minutes (increased)
export const resetLimiter = createLimiter(
  15 * 60 * 1000,
  100,
  'تلاش‌های بازیابی رمز عبور زیاد است. لطفاً بعداً تلاش کنید.',
);

// API endpoints: 10000 requests per 15 minutes (increased)
export const apiLimiter = createLimiter(
  15 * 60 * 1000,
  10000,
  'تعداد درخواست‌های API از حد مجاز گذشته است.',
);

// Upload endpoints: 500 uploads per hour (increased)
export const uploadLimiter = createLimiter(
  60 * 60 * 1000,
  500,
  'تعداد آپلود فایل از حد مجاز (۵۰۰ در ساعت) گذشته است.',
);
