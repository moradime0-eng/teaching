import { Request, Response } from 'express';
import crypto from 'crypto';
import User from '../models/User';
import PendingRegistration from '../models/PendingRegistration';
import Cart from '../models/Cart';
import Wishlist from '../models/Wishlist';
import Membership from '../models/Membership';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { generateTokenPair, verifyRefreshToken } from '../utils/tokenUtils';
import EmailService from '../config/email';
import { otpEmailTemplate, welcomeTemplate } from '../utils/emailTemplates';
import { sanitizeUser } from '../utils/helpers';
import { UserRole } from '../types';
import * as bcrypt from 'bcryptjs';
import redis from '../config/redis';

// OTP rate limiting via Redis (works across multiple server instances)
async function checkOTPRateLimit(email: string): Promise<boolean> {
  const key = `otp:ratelimit:${email.toLowerCase()}`;
  try {
    if (!redis.isConnected || !redis.client) {
      return true;
    }
    const current = await redis.client.incr(key);
    if (current === 1) {
      await redis.client.expire(key, 3600);
    }
    return current <= 100; // Increased from 3 to 100 to avoid login issues
  } catch {
    return true;
  }
}

// ✅ تنظیمات یکسان کوکی‌ها
const getCookieOptions = (maxAgeMs: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  path: '/', // 🔑 دسترسی همگانی کوکی در سراسر دامنه‌ها
  maxAge: maxAgeMs,
});

// ==================== REGISTER (Single Step) ====================
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { fullName, email, password, phone, role } = req.body;

  const normalizedEmail = email.toString().toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw ApiError.conflict('این ایمیل قبلاً ثبت شده. لطفاً وارد شوید.');
  }

  if (phone) {
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      throw ApiError.conflict('کاربری با این شماره موبایل قبلاً ثبت‌نام کرده است');
    }
  }

  const targetRole =
    role === UserRole.INSTRUCTOR
      ? UserRole.INSTRUCTOR
      : role === UserRole.ADMIN
        ? UserRole.ADMIN
        : UserRole.STUDENT;

  const userCount = await User.countDocuments({ isActive: true });
  const isFirstUser = userCount === 0;
  const finalRole = isFirstUser
    ? UserRole.ADMIN
    : targetRole === UserRole.ADMIN
      ? UserRole.STUDENT
      : targetRole;
  if (isFirstUser) {
    console.log('🎉 [First User] اولین کاربر سایت — نقش: ادمین');
  }

  const user = await User.create({
    fullName,
    email: normalizedEmail,
    password,
    phone,
    role: finalRole,
    isEmailVerified: true,
    isActive: true,
    refreshTokens: [],
    instructorProfile: finalRole === UserRole.INSTRUCTOR ? { isApproved: false } : undefined,
    studentProfile:
      finalRole === UserRole.STUDENT ? { completedCourses: 0, totalLearningTime: 0 } : undefined,
  });

  const tokenPayload: any = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const tokens = generateTokenPair(tokenPayload);

  user.refreshTokens = [tokens.refreshToken];
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  await user.save();

  // ✅ تنظیم کوکی‌ها
  res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

  try {
    await EmailService.sendEmail({
      to: user.email,
      subject: 'به همایون خوش آمدید 🎉',
      html: welcomeTemplate(user.fullName),
    });
  } catch (err) {
    console.warn('⚠️ Welcome email failed — non-critical.');
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `🎉 [Register] User created: ${user.email} — Role: ${user.role}${isFirstUser ? ' (اولین کاربر — ادمین خودکار)' : ''}`,
    );
  }

  const successMessage = isFirstUser
    ? 'ثبت‌نام با موفقیت انجام شد. شما به عنوان مدیر سیستم تعیین شدید.'
    : 'ثبت‌نام با موفقیت انجام شد.';

  return ApiResponse.created(
    res,
    { user: sanitizeUser(user), ...tokens }, // 🔑 ارسال توکن‌ها در فرمت JSON جهت خواندن در LocalStorage فرانت‌اند
    successMessage,
  );
});

// ==================== LOGIN ====================
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const normalizedEmail = email?.toString().toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).select('+password +refreshTokens');

  if (!user) {
    // 🔒 در production ایمیل واردشده لاگ نمی‌شود (محافظت از حریم خصوصی / PII)
    if (process.env.NODE_ENV === 'development') {
      console.warn(`❌ [Login] کاربر یافت نشد: "${normalizedEmail}"`);
    }
    throw ApiError.unauthorized('ایمیل یا رمز عبور اشتباه است.');
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [Login] کاربر یافت شد: "${normalizedEmail}"`);
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw ApiError.unauthorized('ایمیل یا رمز عبور اشتباه است.');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('حساب کاربری شما غیرفعال شده است.');
  }

  if (user.isBanned) {
    throw ApiError.forbidden(`حساب شما مسدود شده است. علت: ${user.banReason || 'تخلف'}`);
  }

  if (!user.isEmailVerified) {
    throw ApiError.forbidden('ایمیل شما هنوز تأیید نشده است.');
  }

  const tokenPayload: any = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const tokens = generateTokenPair(tokenPayload);

  if (!Array.isArray(user.refreshTokens)) {
    user.refreshTokens = [];
  }
  if (user.refreshTokens.length >= 5) {
    user.refreshTokens = user.refreshTokens.slice(-4);
  }
  user.refreshTokens.push(tokens.refreshToken);
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  await user.save();

  // ✅ تنظیم کوکی‌ها
  res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

  return ApiResponse.success(
    res,
    { user: sanitizeUser(user), ...tokens }, // 🔑 ارسال توکن‌ها برای لوکال‌استوریج جهت برقراری موفق وب‌سوکت
    'ورود با موفقیت انجام شد',
  );
});

// ==================== REFRESH TOKEN ====================
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;

  if (!token) {
    throw ApiError.unauthorized('رفرش توکن الزامی است');
  }

  try {
    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id).select('+refreshTokens');

    if (!user || !Array.isArray(user.refreshTokens) || !user.refreshTokens.includes(token)) {
      throw ApiError.unauthorized('توکن نامعتبر یا منقضی شده است');
    }

    const tokenPayload: any = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const tokens = generateTokenPair(tokenPayload);

    user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();

    // ✅ تنظیم کوکی‌های جدید
    res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));
    res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

    return ApiResponse.success(res, tokens, 'توکن جدید با موفقیت صادر شد');
  } catch {
    throw ApiError.unauthorized('توکن نامعتبر است');
  }
});

// ==================== LOGOUT ====================
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;

  if (token) {
    const user = await User.findOne({ refreshTokens: token }).select('+refreshTokens');
    if (user && Array.isArray(user.refreshTokens)) {
      user.refreshTokens = user.refreshTokens.filter((t) => t !== token);
      await user.save();
    }
  }

  // ✅ پاک کردن کوکی‌ها
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  return ApiResponse.success(res, null, 'خروج با موفقیت انجام شد');
});

// ==================== FORGOT PASSWORD (OTP-Based) ====================
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  const normalizedEmail = email?.toString().toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return ApiResponse.success(res, null, 'در صورت وجود این ایمیل، کد بازیابی ارسال شد.');
  }

  if (!(await checkOTPRateLimit(normalizedEmail))) {
    throw ApiError.tooManyRequests('درخواست‌های زیادی ارسال شده. لطفاً ۱ ساعت صبر کنید.');
  }

  const otpCode = (() => {
    const crypto = require('crypto');
    return crypto.randomInt(100000, 999999).toString();
  })();
  const hashedOTP = await bcrypt.hash(otpCode, 10);

  await User.findByIdAndUpdate(user._id, {
    $set: {
      resetPasswordOTP: hashedOTP,
      resetPasswordOTPExpires: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  try {
    await EmailService.sendEmail({
      to: normalizedEmail,
      subject: 'کد بازیابی رمز عبور',
      html: otpEmailTemplate(user.fullName, otpCode, 'reset'),
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ [Email Warning] Reset OTP email failed. Code for dev testing:');
      console.log(`🔑 [Reset OTP for "${normalizedEmail}"]: ${otpCode}`);
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`📧 [Forgot Password] OTP sent to "${normalizedEmail}"`);
  }

  return ApiResponse.success(res, { email: normalizedEmail }, 'کد بازیابی به ایمیل شما ارسال شد.');
});

// ==================== RESET PASSWORD (OTP-Based) ====================
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, otpCode, newPassword, confirmPassword } = req.body;

  const normalizedEmail = email?.toString().toLowerCase().trim();

  if (newPassword !== confirmPassword) {
    throw ApiError.badRequest('رمز عبور و تکرار آن مطابقت ندارند.');
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
    throw ApiError.badRequest('رمز عبور باید حداقل ۸ کاراکتر، شامل حرف بزرگ، کوچک و عدد باشد.');
  }

  const user = await User.findOne({
    email: normalizedEmail,
    resetPasswordOTPExpires: { $gt: new Date() },
  }).select('+resetPasswordOTP');

  if (!user || !user.resetPasswordOTP) {
    throw ApiError.badRequest('کد بازیابی منقضی یا نامعتبر است.');
  }

  const isMatch = await bcrypt.compare(otpCode, user.resetPasswordOTP);
  if (!isMatch) {
    throw ApiError.badRequest('کد بازیابی اشتباه است.');
  }

  user.password = newPassword;
  user.resetPasswordOTP = undefined;
  user.resetPasswordOTPExpires = undefined;
  user.refreshTokens = [];
  await user.save();

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔐 [Reset Password] Password reset for "${normalizedEmail}"`);
  }

  return ApiResponse.success(res, null, 'رمز عبور شما با موفقیت تغییر یافت.');
});

// ==================== CHANGE PASSWORD (Logged-in user) ====================
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password +refreshTokens');
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.badRequest('رمز عبور فعلی اشتباه است');
  }

  user.password = newPassword;
  user.refreshTokens = [];
  await user.save();

  // ✅ پاک کردن کوکی‌ها
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });

  return ApiResponse.success(res, null, 'رمز عبور با موفقیت تغییر یافت. لطفاً دوباره وارد شوید');
});

// ==================== GOOGLE OAUTH CALLBACK ====================
export const googleCallback = asyncHandler(async (req: Request, res: Response) => {
  const userFromPassport = req.user as any;

  if (!userFromPassport) {
    throw ApiError.unauthorized('ورود با گوگل ناموفق بود');
  }

  const user = await User.findById(userFromPassport._id).select('+refreshTokens');
  if (!user) {
    throw ApiError.unauthorized('کاربر یافت نشد');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('حساب کاربری شما غیرفعال شده است');
  }

  if (user.isBanned) {
    throw ApiError.forbidden(`حساب شما مسدود شده است. علت: ${user.banReason || 'تخلف'}`);
  }

  const tokenPayload: any = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const tokens = generateTokenPair(tokenPayload);

  if (!Array.isArray(user.refreshTokens)) {
    user.refreshTokens = [];
  }
  if (user.refreshTokens.length >= 5) {
    user.refreshTokens = user.refreshTokens.slice(-4);
  }
  user.refreshTokens.push(tokens.refreshToken);
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  await user.save();

  // ✅ تنظیم کوکی‌ها
  res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

  console.log(`✅ [Google Callback] Cookies set for user: ${user.email}`);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const redirectPath = user.isProfileComplete ? '/auth/callback' : '/auth/complete-registration';

  return res.redirect(`${frontendUrl}${redirectPath}?success=true`);
});

// ==================== GITHUB OAUTH CALLBACK ====================
export const githubCallback = asyncHandler(async (req: Request, res: Response) => {
  const userFromPassport = req.user as any;

  if (!userFromPassport) {
    throw ApiError.unauthorized('ورود با گیت‌هاب ناموفق بود');
  }

  const user = await User.findById(userFromPassport._id).select('+refreshTokens');
  if (!user) {
    throw ApiError.unauthorized('کاربر یافت نشد');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('حساب کاربری شما غیرفعال شده است');
  }

  if (user.isBanned) {
    throw ApiError.forbidden(`حساب شما مسدود شده است. علت: ${user.banReason || 'تخلف'}`);
  }

  const tokenPayload: any = {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const tokens = generateTokenPair(tokenPayload);

  if (!Array.isArray(user.refreshTokens)) {
    user.refreshTokens = [];
  }
  if (user.refreshTokens.length >= 5) {
    user.refreshTokens = user.refreshTokens.slice(-4);
  }
  user.refreshTokens.push(tokens.refreshToken);
  user.lastLogin = new Date();
  user.lastLoginIP = req.ip;
  await user.save();

  // ✅ تنظیم کوکی‌ها
  res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  const redirectPath = user.isProfileComplete ? '/auth/callback' : '/auth/complete-registration';

  return res.redirect(`${frontendUrl}${redirectPath}?success=true`);
});

// ==================== COMPLETE REGISTRATION (OAuth Role Selection + Password) ====================
export const completeRegistration = asyncHandler(async (req: Request, res: Response) => {
  const { role, password, confirmPassword } = req.body;

  if (!req.user) {
    throw ApiError.unauthorized('ابتدا وارد حساب کاربری شوید');
  }

  if (![UserRole.STUDENT, UserRole.INSTRUCTOR].includes(role)) {
    throw ApiError.badRequest('نقش نامعتبر است');
  }

  if (!password || password.length < 8) {
    throw ApiError.badRequest('رمز عبور باید حداقل ۸ کاراکتر باشد');
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
    throw ApiError.badRequest('رمز عبور باید شامل حرف بزرگ، کوچک و عدد باشد.');
  }

  if (confirmPassword && password !== confirmPassword) {
    throw ApiError.badRequest('رمز عبور و تکرار آن مطابقت ندارند.');
  }

  const user = await User.findById(req.user._id).select('+refreshTokens');
  if (!user) {
    throw ApiError.notFound('کاربر یافت نشد');
  }

  if (user.isProfileComplete) {
    throw ApiError.badRequest('ثبت‌نام شما قبلاً تکمیل شده است');
  }

  user.role = role;
  user.isProfileComplete = true;
  user.password = password;

  if (role === UserRole.INSTRUCTOR) {
    user.instructorProfile = { isApproved: false } as any;
    user.studentProfile = undefined;
  } else {
    user.studentProfile = { completedCourses: 0, totalLearningTime: 0 } as any;
    user.instructorProfile = undefined;
  }

  await user.save();

  await Membership.findOneAndUpdate(
    { user: user._id },
    { role: role === UserRole.INSTRUCTOR ? 'instructor' : 'student' },
  );

  const tokenPayload: any = {
    id: user._id.toString(),
    email: user.email,
    role: user.role, // این مقدار اکنون دیگر تهی نیست و نقش اصلی کاربر (مدرس/دانشجو) است
  };

  const tokens = generateTokenPair(tokenPayload);

  // حذف رفرش‌توکن‌های قدیمی مربوط به فاز ثبت‌نام موقت و جایگزینی با توکن نهایی
  user.refreshTokens = [tokens.refreshToken];
  await user.save();

  // آپدیت کردن کوکی‌های کلاینت با اطلاعات نهایی نقش کاربری
  res.cookie('accessToken', tokens.accessToken, getCookieOptions(15 * 60 * 1000));
  res.cookie('refreshToken', tokens.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000));

  console.log(
    `🔐 [Complete Registration] Role updated to "${role}" and issued new tokens for: ${user.email}`,
  );

  // بازگرداندن توکن‌ها به همراه کاربر جهت همگام‌سازی وب‌سوکت
  return ApiResponse.success(
    res,
    { user: sanitizeUser(user), ...tokens }, // 🔑 ارسال توکن‌ها در JSON بدنه پاسخ
    'ثبت‌نام با موفقیت تکمیل شد',
  );
});
