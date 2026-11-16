/**
 * 💳 کنترلر پرداخت — پیاده‌سازی کامل درگاه NikPal
 */

import { Request, Response } from 'express';
import Payment from '../models/Payment';
import Course from '../models/Course';
import Cart from '../models/Cart';
import Coupon from '../models/Coupon';
import Enrollment from '../models/Enrollment';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { PaymentStatus, UserRole, NotificationType } from '../types';
import { nikpalService, NikpalError } from '../services/nikpal.service';
import { nikpalConfig } from '../config/nikpal';
import { createNotification } from './notificationController';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { calculateCoursePricing } from '../services/pricing.service';
import { getActiveCampaign, isCourseInCampaignScope } from '../services/campaign.service';
import { refundService } from '../services/refund.service';
import { walletService, InsufficientBalanceError } from '../services/wallet.service';
import WalletTransaction from '../models/WalletTransaction';
import { validateCouponScope } from '../services/coupon.service';
import { rialMatchesToman, tomanToRial } from '../utils/currency';
import { MAX_TOTAL_DISCOUNT_PERCENT, getMinimumAllowedPrice } from '../config/discount.config';

// ==================== Constants ====================
const INSTRUCTOR_SHARE_PERCENT = 0.7;
const PLATFORM_SHARE_PERCENT = 0.3;
const PENDING_EXPIRY_MINUTES = 30;
const CONCURRENT_PAYMENT_WINDOW_MINUTES = 15;
const REFUND_WINDOW_MINUTES = 30;
// ⚠️ FIX CRITICAL: حداکثر تلاش‌های verify پیش از بستنِ دائمیِ تراکنشِ FAILED
const MAX_VERIFY_ATTEMPTS = 5;
// پنجره‌ی قابل‌بازیابیِ تأیید مجدد برای تراکنش‌های FAILED (ساعت)
const RECOVERABLE_VERIFY_WINDOW_HOURS = 24;
// مدت اعتبار قیمت قفل‌شده‌ی سبد خرید (priceAtAdd) به ساعت — باگ M3
const PRICE_LOCK_EXPIRY_HOURS = 24;

// ==================== Helpers ====================
// export: برای استفاده‌ی کیف پول/شارژ (walletController) و تراکنش‌های مشابه
export const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = uuidv4().substring(0, 8).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

function calculateCoursePrice(course: any): number {
  const pricing = calculateCoursePricing(course);
  return pricing.currentPrice;
}

export function paymentLog(action: string, data: Record<string, any>): void {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join(' | ');
  console.log(`[PAYMENT] ${action} | ${parts} | ${new Date().toISOString()}`);
}

/**
 * ⚠️ FIX CRITICAL — تشخیص «ردِ صریحِ درگاه» از «خطای موقت شبکه/سرور».
 *
 * NikpalError با کد 4xx یعنی خودِ درگاه درخواست را رد کرده (پاسخ قطعی) → FAILED مجاز است.
 * NikpalError با کد 5xx (شامل NETWORK_ERROR پس از اتمام retryها) یا هر خطای غیر-NikPal
 * یعنی ارتباط قطع شده / سرور درگاه در دسترس نیست → موقتی است و پرداخت باید PENDING بماند
 * تا verify مجدد (یا job تطبیق) پرداخت واقعی را نهایی کند.
 */
function isExplicitGatewayRejection(error: unknown): error is NikpalError {
  return (
    error instanceof NikpalError && error.statusCode >= 400 && error.statusCode < 500
  );
}

/**
 * ⚠️ FIX CRITICAL — ثبت خطای verify روی سند پرداخت بدون FAILED کردن آن.
 * lastVerifyError / verifyAttemptCount / lastVerifyAttemptAt برای عیب‌یابی و
 * تصمیمِ بازیابی (isRecoverableFailed) استفاده می‌شوند.
 */
function recordVerifyFailure(payment: any, error: unknown): void {
  payment.lastVerifyError = error instanceof Error ? error.message : String(error);
  payment.verifyAttemptCount = (payment.verifyAttemptCount || 0) + 1;
  payment.lastVerifyAttemptAt = new Date();
}

/**
 * آیا یک تراکنش FAILED هنوز قابل تأیید مجدد است؟
 * شرط: کمتر از MAX_VERIFY_ATTEMPTS تلاش ناموفق + آخرین تلاش در پنجره‌ی ۲۴ ساعته.
 * برای رکوردهای قدیمی FAILED (بدون lastVerifyAttemptAt) از createdAt استفاده می‌شود
 * تا سازگاری عقب‌رو حفظ شود.
 */
function isRecoverableFailed(payment: any): boolean {
  if (payment.status !== PaymentStatus.FAILED) return false;
  const attempts = payment.verifyAttemptCount || 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS) return false;
  const reference = payment.lastVerifyAttemptAt || payment.createdAt;
  if (!reference) return false;
  const windowMs = RECOVERABLE_VERIFY_WINDOW_HOURS * 60 * 60 * 1000;
  return Date.now() - new Date(reference).getTime() <= windowMs;
}

// ====================================================================
// 1. CREATE PAYMENT
/**
 * ⚠️ FIX HIGH (Race Condition): ثبت اتمیک مصرف کوپون.
 *
 * پیش از این، ابتدا در حافظه چک می‌شد که `usedCount < usageLimit` و چند خط بعد
 * `$inc` انجام می‌شد. بین این دو فاصله وجود دارد، بنابراین دو درخواست همزمان
 * هر دو از چک عبور می‌کردند و سقف مصرف کوپون شکسته می‌شد.
 *
 * راه‌حل: شرط را داخل خودِ `findOneAndUpdate` می‌گذاریم تا در سطح دیتابیس اتمیک شود.
 * اگر سندی مطابق شرط پیدا نشود، `null` برمی‌گردد و یعنی سقف مصرف تکمیل شده است.
 */
const consumeCouponAtomically = async (
  couponId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string,
  paymentId: mongoose.Types.ObjectId | string,
  session?: mongoose.ClientSession,
) => {
  const filter: any = {
    _id: couponId,
    isActive: true,
    // سقف کل مصرف، به‌صورت اتمیک
    $expr: {
      $or: [
        { $eq: [{ $ifNull: ['$usageLimit', null] }, null] },
        { $lt: ['$usedCount', '$usageLimit'] },
      ],
    },
    // سقف مصرف هر کاربر، به‌صورت اتمیک
    $exprPerUser: {
      $lt: [
        {
          $size: {
            $filter: {
              input: '$usedBy',
              as: 'u',
              cond: { $eq: ['$$u.user', userId] },
            },
          },
        },
        '$usageLimitPerUser',
      ],
    },
  };

  // MongoDB اجازه‌ی دو کلید $expr جدا ندارد؛ آن‌ها را در یک $and ترکیب می‌کنیم
  filter.$and = [
    { $expr: filter.$expr },
    { $expr: filter.$exprPerUser },
  ];
  delete filter.$expr;
  delete filter.$exprPerUser;

  const updated = await Coupon.findOneAndUpdate(
    filter,
    {
      $inc: { usedCount: 1 },
      $push: { usedBy: { user: userId, usedAt: new Date(), payment: paymentId } },
    },
    { new: true, session },
  );

  if (!updated) {
    throw ApiError.badRequest('ظرفیت استفاده از این کد تخفیف تکمیل شده است');
  }
  return updated;
};

// ====================================================================
export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  // Graceful Degradation
  if (!nikpalConfig.isPaymentEnabled) {
    return ApiResponse.error(res, 'سیستم پرداخت موقتاً غیرفعال است', 503);
  }
  if (!req.user) throw ApiError.unauthorized();
  const userId = req.user._id;
  // [MULTI-TENANT-DISABLED] const tenantId = req.tenantId!;

  const { courseIds, courseId, couponCode, paymentMethod } = req.body;
  const targetCourseIds: string[] = courseId
    ? [courseId]
    : courseIds && Array.isArray(courseIds) && courseIds.length > 0
      ? courseIds
      : [];

  if (targetCourseIds.length === 0) {
    throw ApiError.badRequest('حداقل یک دوره باید انتخاب شود');
  }

  const courses = await Course.find({
    _id: { $in: targetCourseIds },
    status: 'published',
    // [MULTI-TENANT-DISABLED] tenant: tenantId,
  });

  if (courses.length !== targetCourseIds.length) {
    const foundIds = courses.map((c) => c._id.toString());
    const missing = targetCourseIds.filter((id) => !foundIds.includes(id));
    throw ApiError.notFound(`دوره(های) زیر یافت نشد یا منتشر نشده‌اند: ${missing.join(', ')}`);
  }

  // بررسی Enrollment تکراری
  const existingEnrollments = await Enrollment.find({
    student: userId,
    course: { $in: targetCourseIds },
    isRefunded: false,
  });

  if (existingEnrollments.length > 0) {
    const enrolledNames = existingEnrollments.map((e) => {
      const c = courses.find((c) => c._id.toString() === e.course.toString());
      return c?.title || e.course.toString();
    });
    throw ApiError.conflict(
      `شما قبلاً در دوره(های) زیر ثبت‌نام کرده‌اید: ${enrolledNames.join(', ')}`,
    );
  }

  // ─── دریافت سبد خرید کاربر برای استفاده از قیمت‌های قفل‌شده (priceAtAdd) ───
  const cart = await Cart.findOne({ user: req.user._id }).populate(
    'items.course',
    'title price',
  );

  // ─── ⚠️ FIX M3: انقضای قیمت قفل‌شده‌ی سبد (priceAtAdd) ───
  // قیمت لحظه‌ی افزودن فقط ۲۴ ساعت معتبر است؛ وگرنه کاربر می‌توانست در اوج
  // تخفیف معکوس به سبد اضافه کند و هفته‌ها بعد با همان قیمت پایین بخرد.
  const priceExpiryTime = new Date(
    Date.now() - PRICE_LOCK_EXPIRY_HOURS * 60 * 60 * 1000,
  );
  const hasExpiredPrices = cart?.items?.some(
    (it) => !it.addedAt || it.addedAt < priceExpiryTime,
  );
  if (hasExpiredPrices && cart) {
    // بازآوری قیمت‌های منقضی از قیمت‌گذاری فعلی سرور + ریست addedAt
    for (const item of cart.items) {
      if (!item.addedAt || item.addedAt < priceExpiryTime) {
        const freshCourse = await Course.findById(
          typeof item.course === 'object' && item.course._id
            ? item.course._id
            : item.course,
        );
        if (freshCourse) {
          item.priceAtAdd = calculateCoursePrice(freshCourse);
        }
        item.addedAt = new Date();
      }
    }
    await cart.save();

    paymentLog('PRICE_LOCK_EXPIRED', {
      userId,
      cartId: cart._id,
      itemCount: cart.items.length,
    });

    // ⚠️ 409 Conflict (نه 400): قیمت‌ها به‌روز شدند — کاربر باید سبد را بازبینی کند
    return res.status(409).json({
      success: false,
      statusCode: 409,
      message: 'قیمت برخی دوره‌ها تغییر کرده است. لطفاً سبد خرید را بررسی کنید.',
      updatedCart: cart,
    });
  }

  // ساخت نقشه قیمت‌های قفل‌شده از سبد خرید
  const lockedPriceMap = new Map<string, number>();
  if (cart?.items) {
    for (const item of cart.items) {
      if (item.priceAtAdd !== undefined && item.priceAtAdd !== null) {
        const courseIdStr =
          typeof item.course === 'object' && item.course._id
            ? item.course._id.toString()
            : item.course?.toString();
        if (courseIdStr) {
          lockedPriceMap.set(courseIdStr, item.priceAtAdd);
        }
      }
    }
  }

  // ─── Fetch active campaign ONCE (server-side, D3) ───
  const { campaign: activeCampaign } = await getActiveCampaign();

  // محاسبه قیمت‌ها: اولویت با قیمت قفل‌شده سبد خرید (priceAtAdd)
  // ⚠️ FIX CRITICAL: سهم‌های اولیه به‌صورت موقت روی قیمت خام ساخته می‌شوند و
  // بعد از اعمال تخفیف، بر اساس قیمتِ واقعیِ پرداخت‌شده (adjustedPrice) بازتعریف
  // می‌شوند — وگرنه پلتفرم از جیب تخفیفِ کوپن به مدرس می‌پرداخت.
  let totalAmount = 0;
  let items = courses.map((course) => {
    // 🎯 استفاده از قیمت قفل‌شده سبد خرید اگر وجود داشت
    const lockedPrice = lockedPriceMap.get(course._id.toString());
    const courseOwnPrice =
      lockedPrice !== undefined
        ? lockedPrice
        : calculateCoursePrice(course);

    // D3: Apply campaign discount as a SEPARATE time-checked layer
    // Re-validate campaign time window and scope server-side
    let effectivePrice = courseOwnPrice;
    let campaignApplied = false;

    if (activeCampaign && activeCampaign.isActive) {
      const now = Date.now();
      const startAt = new Date(activeCampaign.startAt).getTime();
      const endAt = new Date(activeCampaign.endAt).getTime();

      if (now >= startAt && now < endAt && isCourseInCampaignScope(course, activeCampaign)) {
        // Compute campaign price
        let campaignPrice: number;
        if (activeCampaign.discountType === 'percentage') {
          const discountAmount = Math.floor((courseOwnPrice * activeCampaign.discountValue) / 100);
          const cappedDiscount = activeCampaign.maxDiscount
            ? Math.min(discountAmount, activeCampaign.maxDiscount)
            : discountAmount;
          campaignPrice = courseOwnPrice - cappedDiscount;
        } else {
          campaignPrice = courseOwnPrice - activeCampaign.discountValue;
        }
        campaignPrice = Math.max(0, Math.floor(campaignPrice));

        // D1: Enforce maximum total discount cap (80% of original price)
        const minimumAllowedPrice = getMinimumAllowedPrice(course.price || 0);
        campaignPrice = Math.max(campaignPrice, minimumAllowedPrice);

        // D2 Best-of: pick the lower price
        if (campaignPrice < effectivePrice) {
          effectivePrice = campaignPrice;
          campaignApplied = true;
        }
      }
    }

    totalAmount += effectivePrice;
    return {
      course: course._id,
      price: effectivePrice, // This is the price after campaign (before coupon)
      originalCoursePrice: course.price || 0, // For 80% cap calculation
      campaignApplied,
      // مقدار اولیه = قیمت خام (وقتی تخفیفی در کار نباشد همین می‌ماند)
      adjustedPrice: effectivePrice,
      instructorShare: Math.round(effectivePrice * INSTRUCTOR_SHARE_PERCENT),
      platformShare: Math.round(effectivePrice * PLATFORM_SHARE_PERCENT),
    };
  });

  // اعمال کد تخفیف
  let discountAmount = 0;
  let couponId: mongoose.Types.ObjectId | undefined;

  if (couponCode) {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      validUntil: { $gte: new Date() },
    });
    if (!coupon) throw ApiError.badRequest('کد تخفیف نامعتبر یا منقضی شده است');

    // ⚠️ FIX M1: اعتبارسنجی دامنه‌ی کوپن — «پیش از» محاسبه‌ی تخفیف و پیش از
    // سقف‌ها (applicableCourses/applicableCategories/excludedCourses/
    // isFirstPurchaseOnly قبلاً هیچ‌جا اعمال نمی‌شدند)
    const scopeCourseIds = [...new Set(items.map((i) => i.course.toString()))];
    const scopeCategoryIds = [
      ...new Set(courses.map((c) => c.category?.toString()).filter((c): c is string => !!c)),
    ];
    const scopeCheck = await validateCouponScope(
      coupon,
      scopeCourseIds,
      scopeCategoryIds,
      userId.toString(),
    );
    if (!scopeCheck.valid) {
      throw ApiError.badRequest(
        scopeCheck.reason || 'کد تخفیف برای این سفارش قابل استفاده نیست',
      );
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw ApiError.badRequest('ظرفیت استفاده از این کد تخفیف تکمیل شده است');
    }
    const userUsage = coupon.usedBy.filter(
      (u) => u.user.toString() === userId.toString(),
    ).length;
    if (userUsage >= coupon.usageLimitPerUser) {
      throw ApiError.badRequest('شما قبلاً از این کد تخفیف استفاده کرده‌اید');
    }
    if (coupon.discountType === 'percentage') {
      discountAmount = Math.round((totalAmount * coupon.discountValue) / 100);
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, totalAmount);
    }
    if (coupon.minPurchase && totalAmount < coupon.minPurchase) {
      throw ApiError.badRequest(
        `حداقل مبلغ خرید برای این کد تخفیف ${coupon.minPurchase.toLocaleString('fa-IR')} تومان است`,
      );
    }
    couponId = coupon._id;
  }

  const finalAmount = Math.max(0, totalAmount - discountAmount);

  // ─── D1: Enforce 80% cap AFTER coupon (combined campaign + coupon) ───
  // For each item, ensure the final adjustedPrice doesn't exceed 80% discount from original
  if (finalAmount > 0) {
    let runningAdjusted = 0;
    items = items.map((item, index) => {
      const isLast = index === items.length - 1;
      const ratio = totalAmount > 0 ? item.price / totalAmount : 0;
      // آیتم آخر باقیمانده‌ی رندینگ را می‌گیرد تا جمع adjustedPriceها == finalAmount
      let adjustedPrice = isLast
        ? finalAmount - runningAdjusted
        : Math.round(finalAmount * ratio);
      runningAdjusted += adjustedPrice;

      // D1: Enforce maximum total discount cap per item (80% of original course price)
      const originalCoursePrice = item.originalCoursePrice || item.price;
      const minimumAllowedPrice = getMinimumAllowedPrice(originalCoursePrice);
      adjustedPrice = Math.max(adjustedPrice, minimumAllowedPrice);

      const instructorShare = Math.round(adjustedPrice * INSTRUCTOR_SHARE_PERCENT);
      return {
        ...item,
        adjustedPrice,
        instructorShare,
        platformShare: adjustedPrice - instructorShare,
      };
    });
  } else {
    // تخفیف ۱۰۰٪ یا دوره رایگان → هیچ پولی جابجا نمی‌شود؛ سهم‌ها صفر
    items = items.map((item) => ({
      ...item,
      adjustedPrice: 0,
      instructorShare: 0,
      platformShare: 0,
    }));
  }

  // Concurrent Payment Guard
  const fifteenMinutesAgo = new Date(
    Date.now() - CONCURRENT_PAYMENT_WINDOW_MINUTES * 60 * 1000,
  );
  const existingPending = await Payment.findOne({
    user: userId,
    // [MULTI-TENANT-DISABLED] tenant: tenantId,
    status: PaymentStatus.PENDING,
    // شارژ کیف پول در انتظار نباید درخواست خرید دوره را «ربوده» و آدرس خودش را برگرداند
    paymentMethod: { $ne: 'wallet-topup' },
    createdAt: { $gte: fifteenMinutesAgo },
  });

  if (existingPending) {
    if (existingPending.gatewayAuthority) {
      paymentLog('CONCURRENT_PAYMENT_RETURNED', { userId, paymentId: existingPending._id });
      return ApiResponse.success(
        res,
        {
          paymentId: existingPending._id,
          orderNumber: existingPending.orderNumber,
          finalAmount: existingPending.finalAmount,
          gatewayUrl: nikpalService.getPaymentUrl(existingPending.gatewayAuthority),
        },
        'شما قبلاً درخواست پرداخت داشته‌اید',
      );
    }
    existingPending.status = PaymentStatus.EXPIRED;
    existingPending.failureReason = 'درخواست پرداخت جدید ایجاد شد';
    await existingPending.save();
  }

  // پرداخت رایگان
  if (finalAmount === 0) {
    // ⚠️ FIX HIGH: کل این بلوک داخل تراکنش اجرا می‌شود.
    // پیش از این، Payment با وضعیت SUCCESS ساخته می‌شد و بعد Enrollmentها و
    // شمارنده‌ها ایجاد می‌شدند. اگر کاربر از قبل ثبت‌نام داشته باشد،
    // Enrollment.create با خطای E11000 (یونیک ایندکس student+course) می‌شکست و
    // نتیجه: پرداخت موفق با ثبت‌نام ناقص و totalStudents ناسازگار باقی می‌ماند.
    const freeSession = await mongoose.startSession();
    let payment: any;
    try {
      await freeSession.withTransaction(async () => {
        payment = await Payment.create(
          [
            {
              user: userId,
              orderNumber: generateOrderNumber(),
              items,
              totalAmount,
              discountAmount,
              finalAmount: 0,
              coupon: couponId,
              campaign: activeCampaign?._id,
              paymentMethod: 'free',
              status: PaymentStatus.SUCCESS,
              paidAt: new Date(),
              callbackStatus: 'FREE',
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
          ],
          { session: freeSession },
        );
        payment = payment[0];

        for (const item of items) {
          // 🎯 upsert به‌جای create: اگر ثبت‌نام تکراری باشد، خطا نمی‌دهد
          // و شمارنده فقط یک‌بار افزایش می‌یابد.
          const upsertResult: any = await Enrollment.findOneAndUpdate(
            { student: userId, course: item.course },
            {
              $setOnInsert: {
                student: userId,
                course: item.course,
                payment: payment._id,
                pricePaid: 0,
                couponUsed: couponId,
                campaignUsed: activeCampaign?._id,
                isRefunded: false,
              },
            },
            { new: true, upsert: true, includeResultMetadata: true, session: freeSession },
          );

          const alreadyExisted = upsertResult?.lastErrorObject?.updatedExisting === true;
          if (!alreadyExisted) {
            await Course.findByIdAndUpdate(
              item.course,
              { $inc: { totalStudents: 1 } },
              { session: freeSession },
            );
          } else if (upsertResult?.value?.isRefunded) {
            // ✅ FIX H2: خرید مجدد پس از بازپرداخت → فعال‌سازی مجدد + شمارنده
            await Enrollment.updateOne(
              { _id: upsertResult.value._id },
              {
                $set: {
                  isRefunded: false,
                  refundedAt: null,
                  refundReason: null,
                  payment: payment._id,
                  pricePaid: 0,
                },
              },
              { session: freeSession },
            );
            await Course.findByIdAndUpdate(
              item.course,
              { $inc: { totalStudents: 1 } },
              { session: freeSession },
            );
          }
        }

        if (couponId) {
          // ⚠️ FIX: مصرف اتمیک کوپون (جلوگیری از عبور همزمان از سقف مصرف)
          await consumeCouponAtomically(couponId, userId, payment._id, freeSession);
        }

        await Cart.findOneAndUpdate(
          // [MULTI-TENANT-DISABLED] - فیلتر tenant حذف شده
          { user: userId },
          { $set: { items: [], discountAmount: 0, finalPrice: 0 } },
          { session: freeSession },
        );
      });
    } finally {
      await freeSession.endSession();
    }

    for (const course of courses) {
      await createNotification({
        recipient: userId.toString(),
        type: NotificationType.PAYMENT,
        title: 'پرداخت شما با موفقیت انجام شد',
        message: `دوره "${course.title}" با موفقیت خریداری شد.`,
        link: `/course/${course.slug}`,
      });
      await createNotification({
        recipient: course.instructor.toString(),
        sender: userId.toString(),
        type: NotificationType.ENROLLMENT,
        title: 'دانشجوی جدید',
        message: `یک دانشجوی جدید در دوره "${course.title}" ثبت‌نام کرد.`,
        link: `/course/${course.slug}`,
      });
    }

    paymentLog('FREE_ENROLLMENT', { userId, courseIds: targetCourseIds.join(','), amount: 0 });
    return ApiResponse.created(res, payment, 'ثبت‌نام در دوره(های) رایگان با موفقیت انجام شد');
  }

  // پرداخت از کیف پول
  if (paymentMethod === 'wallet') {
    // ⚠️ FIX CRITICAL: کسر موجودی به‌درون تراکنش منتقل شد (زیرمجموعه‌ی اول این بازنویسی).
    let payment: any;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // ۱. 🔒 کسر اتمیک موجودی از طریق WalletService (ضد double-spend: شرط
        //    balance >= مبلغ داخل خودِ سرویس است) + ثبت خودکار رکورد در دفتر کل
        const orderNumber = generateOrderNumber();
        try {
          await walletService.debit(userId, finalAmount, {
            reason: 'purchase',
            description: `پرداخت سفارش ${orderNumber}`,
            session,
          });
        } catch (err) {
          if (!(err instanceof InsufficientBalanceError)) throw err;
          // پرتاب خطا → withTransaction خودش abort می‌کند؛ هیچ چیزی ثبت نشده است
          throw ApiError.badRequest('موجودی کیف پول کافی نیست');
        }

        // ۲. ثبت سند پرداخت (همان تراکنش)
        const created = await Payment.create(
        [{
          user: userId,
          orderNumber,
          items,
          totalAmount,
          discountAmount,
          finalAmount,
          coupon: couponId,
          campaign: activeCampaign?._id,
          paymentMethod: 'wallet',
          status: PaymentStatus.SUCCESS,
          paidAt: new Date(),
          callbackStatus: 'WALLET',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }],
        { session },
      );
      payment = created[0];

        // اتصال رکورد دفتر کلِ خرید (که پیش از ساخت سند ثبت شد) به شناسه‌ی پرداخت
        await WalletTransaction.updateOne(
          { user: userId, type: 'debit', reason: 'purchase', description: `پرداخت سفارش ${orderNumber}` },
          { $set: { relatedPayment: payment._id } },
          { session },
        );
      // ۳. ثبت‌نام‌ها + شمارنده‌ها + واریز سهم مدرس (همان تراکنش)
      for (const item of items) {
        // ✅ FIX H2: خرید مجدد پس از بازپرداخت — سند نرم‌حذف‌شده (isRefunded)
        // باید دوباره فعال شود؛ create خالی با ایندکس یونیک {student,course} می‌شکست
        const existingEnrollment = await Enrollment.findOne({
          student: userId,
          course: item.course,
        }).session(session);
        if (existingEnrollment) {
          existingEnrollment.isRefunded = false;
          existingEnrollment.refundedAt = undefined;
          existingEnrollment.refundReason = undefined;
          existingEnrollment.payment = payment._id;
          existingEnrollment.pricePaid = item.adjustedPrice ?? item.price;
          existingEnrollment.couponUsed = couponId;
          existingEnrollment.campaignUsed = activeCampaign?._id;
          await existingEnrollment.save({ session });
        } else {
          await Enrollment.create(
            // pricePaid = مبلغ واقعیِ پرداخت‌شدهِ آیتم بعد از تخفیف (adjustedPrice)
            [{ student: userId, course: item.course, payment: payment._id, pricePaid: item.adjustedPrice ?? item.price, couponUsed: couponId, campaignUsed: activeCampaign?._id }],
            { session },
          );
        }
        await Course.findByIdAndUpdate(
          item.course,
          { $inc: { totalStudents: 1, totalRevenue: item.instructorShare } },
          { session },
        );
        const course = courses.find((c) => c._id.toString() === item.course.toString());
        if (course && item.instructorShare > 0) {
          // سهم مدرس از طریق WalletService (ثبت در دفتر کل + totalEarnings)
          await walletService.credit(course.instructor, item.instructorShare, {
            reason: 'instructor_share',
            relatedPayment: payment._id,
            relatedCourse: item.course,
            deltaInstructorEarnings: true,
            session,
          });
        }
      }

      if (couponId) {
        // ⚠️ FIX: مصرف اتمیک کوپون داخل تراکنش
        await consumeCouponAtomically(couponId, userId, payment._id, session);
      }

      await Cart.findOneAndUpdate(
        { user: userId },
        // [MULTI-TENANT-DISABLED] tenant: tenantId removed from filter
        { $set: { items: [], discountAmount: 0, finalPrice: 0 } },
        { session },
      );
      });
      // withTransaction در صورت موفقیت خودش commit و در صورت خطا خودش abort می‌کند
    } finally {
      await session.endSession();
    }

    // ✅ FIX H1: تراکنش کامیت شده — اعلان‌ها در «منطقه‌ی امن»ِ بعد از تراکنش.
    // پیش‌ز این، اعلان‌ها داخل try و بعد از commit بودند؛ خطای اعلان →
    // abortTransactionِ بعد از commit → خطای driver → پاسخ ۵۰۰ با وجود
    // پرداختِ موفق. حالا خطای اعلان فقط لاگ می‌شود و کاربر همیشه موفق می‌بیند.
    try {
      const notifications: Promise<unknown>[] = [];
      for (const course of courses) {
        notifications.push(
          createNotification({
            recipient: userId.toString(),
            type: NotificationType.PAYMENT,
            title: 'پرداخت شما با موفقیت انجام شد',
            message: `دوره "${course.title}" با موفقیت خریداری شد.`,
            link: `/course/${course.slug}`,
          }),
          // اعلان به مدرس — قبلاً در مسیر کیف پول فقط دانشجو اعلان می‌گرفت
          createNotification({
            recipient: course.instructor.toString(),
            sender: userId.toString(),
            type: NotificationType.ENROLLMENT,
            title: 'دانشجوی جدید',
            message: `یک دانشجوی جدید در دوره "${course.title}" ثبت‌نام کرد.`,
            link: `/course/${course.slug}`,
          }),
        );
      }
      await Promise.allSettled(notifications);
    } catch (notifError) {
      paymentLog('WALLET_NOTIFICATION_FAILED', {
        paymentId: payment?._id,
        error: notifError instanceof Error ? notifError.message : String(notifError),
      });
    }

    paymentLog('WALLET_PAYMENT', { userId, courseIds: targetCourseIds.join(','), amount: finalAmount, paymentId: payment?._id });
    return ApiResponse.created(res, payment, 'پرداخت از کیف پول با موفقیت انجام شد');
  }

  // پرداخت از طریق درگاه NikPal
  const payment = await Payment.create({
    user: userId,
    orderNumber: generateOrderNumber(),
    items,
    totalAmount,
    discountAmount,
    finalAmount,
    coupon: couponId,
    campaign: activeCampaign?._id,
    paymentMethod: 'nikpal',
    status: PaymentStatus.PENDING,
    metadata: { email: req.user.email, mobile: req.body.mobile },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  try {
    // 💱 قرارداد واحد پول: مبلغ داخلی به تومان به adapter داده می‌شود؛
    // تبدیل تومان→ریال فقط داخل nikpal.service (مرز درگاه) انجام می‌شود.
    const nikpalResult = await nikpalService.createPayment({
      amountToman: payment.finalAmount,
      orderId: payment.orderNumber,
      callbackUrl: nikpalConfig.callbackUrl,
    });

    payment.gatewayAuthority = nikpalResult.paymentId;
    payment.paymentMethod = 'nikpal';
    await payment.save();

    paymentLog('NIKPAL_REQUEST_SUCCESS', {
      userId,
      courseId: targetCourseIds.join(','),
      amount: payment.finalAmount,
      paymentId: nikpalResult.paymentId,
    });

    return ApiResponse.success(
      res,
      {
        paymentId: payment._id,
        orderNumber: payment.orderNumber,
        finalAmount: payment.finalAmount,
        gatewayUrl: nikpalResult.paymentUrl,
      },
      'درخواست پرداخت ایجاد شد',
      201,
    );
  } catch (error) {
    payment.status = PaymentStatus.FAILED;
    payment.failureReason =
      error instanceof NikpalError
        ? `${error.message}${error.errorCode ? ` (کد: ${error.errorCode})` : ''}`
        : 'خطا در اتصال به درگاه پرداخت';
    await payment.save();
    paymentLog('NIKPAL_REQUEST_FAILED', {
      userId,
      courseId: targetCourseIds.join(','),
      amount: payment.finalAmount,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof NikpalError) {
      // ⚠️ خطای ۴۰۱/۴۰۳ خود درگاه نباید با همان کد به کلاینت برگردد:
      // فرانت‌اند auth.interceptor هر ۴۰۱ را «انقضای نشست» تفسیر می‌کند،
      // refresh می‌زند و در صورت شکست کاربر را به صفحه لاگین می‌فرستد.
      // خطای درگاه را با 502 (Bad Gateway) برگردان تا از لاگاوت جعلی جلوگیری شود.
      const clientStatus =
        error.statusCode === 401 || error.statusCode === 403 ? 502 : error.statusCode;
      return ApiResponse.error(res, error.message, clientStatus);
    }
    return ApiResponse.error(res, 'خطا در اتصال به درگاه پرداخت', 500);
  }
});

// ====================================================================
// Helper: نهایی‌سازی پرداخت موفق درگاه داخل تراکنش MongoDB
// (وضعیت + enrollment + سهم مدرس + کوپن + خالی کردن سبد + اعلان‌ها)
// در صورت شکست تراکنش، refId ذخیره و خطا پرتاب می‌شود.
// ====================================================================
type GatewayVerifyResult = {
  paymentId: string;
  orderId: string;
  status: string;
  /** مبلغ تأییدشده درگاه به ریال (قرارداد NikPal) */
  amount: number;
  referenceId?: string;
};

/**
 * ✅ FIX H5: مبلغ تأییدشده درگاه با مبلغ سفارش مطابقت ندارد.
 * پرداخت نهایی نمی‌شود؛ سند FAILED و علت اختلاف ثبت می‌شود.
 */
export class GatewayAmountMismatchError extends Error {
  constructor(
    public expectedToman: number,
    public actualRial: number,
  ) {
    super(
      `مبلغ تأییدشده درگاه (${actualRial} ریال) با مبلغ سفارش (${expectedToman} تومان) مطابقت ندارد`,
    );
    this.name = 'GatewayAmountMismatchError';
  }
}

export const finalizeGatewayPayment = async (
  payment: any,
  referenceId?: string,
  /** 💱 مبلغ تأییدشده درگاه به ریال — برای اعتبارسنجی H5؛ اگر داده نشود (مثلاً از status) فقط وضعیت نهایی می‌شود */
  gatewayAmountRial?: number,
): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // ✅ FIX H5: تطبیق مبلغ درگاه (ریال) با مبلغ سفارش (تومان) — فقط همین‌جا،
      // در تنها نقطه نهایی‌سازی؛ بدون تبدیل مجدد در callback/verify/گزارش‌ها.
      if (
        gatewayAmountRial !== undefined &&
        !rialMatchesToman(gatewayAmountRial, payment.finalAmount)
      ) {
        throw new GatewayAmountMismatchError(payment.finalAmount, gatewayAmountRial);
      }

      payment.status = PaymentStatus.SUCCESS;
      payment.gatewayRefId = referenceId ? String(referenceId) : payment.gatewayRefId || '';
      payment.callbackStatus = 'PAID';
      payment.verifiedAt = new Date();
      payment.paidAt = new Date();
      await payment.save({ session });

      if (payment.paymentMethod === 'wallet-topup') {
        // ⚠️ شارژ کیف پول: به‌جای صدور ثبت‌نام — آیتم‌ها خالی‌اند، کوپنی در کار
        // نیست و مهم‌تر: سبد خرید کاربر نباید به خاطر شارژ پاک شود!
        await walletService.credit(payment.user, payment.finalAmount, {
          reason: 'topup',
          description: `شارژ کیف پول از درگاه (سفارش ${payment.orderNumber})`,
          relatedPayment: payment._id,
          session,
        });
      }

      // ثبت‌نام دانشجو (idempotent) + شمارنده‌ها + سهم مدرس
      for (const item of payment.items) {
        const existingEnrollment = await Enrollment.findOne({
          student: payment.user,
          course: item.course,
        }).session(session);

        if (!existingEnrollment || existingEnrollment.isRefunded) {
          if (existingEnrollment) {
            // ✅ FIX H2: خرید مجدد پس از بازپرداخت → فعال‌سازی همان سند
            // (ایندکس یونیک {student,course} مانع create می‌شود؛ پیشرفت حفظ می‌شود)
            existingEnrollment.isRefunded = false;
            existingEnrollment.refundedAt = undefined;
            existingEnrollment.refundReason = undefined;
            existingEnrollment.payment = payment._id;
            existingEnrollment.pricePaid = item.adjustedPrice ?? item.price;
            existingEnrollment.couponUsed = payment.coupon;
            await existingEnrollment.save({ session });
          } else {
            await Enrollment.create(
              [{
                student: payment.user,
                course: item.course,
                payment: payment._id,
                // pricePaid = مبلغ واقعیِ پرداخت‌شدهِ آیتم بعد از تخفیف؛
                // برای رکوردهای قدیمی بدون adjustedPrice به price fallback می‌شود
                pricePaid: item.adjustedPrice ?? item.price,
                couponUsed: payment.coupon,
              }],
              { session },
            );
          }
          // شمارنده‌ها + واریز سهم مدرس — فقط برای ثبت‌نام تازه یا فعال‌شده
          await Course.findByIdAndUpdate(
            item.course,
            { $inc: { totalStudents: 1, totalRevenue: item.instructorShare } },
            { session },
          );

          // ✅ FIX: واریز سهم مدرس به کیف پول (قبلاً در callback درگاه انجام نمی‌شد)
          const course = await Course.findById(item.course).session(session);
          if (course?.instructor && item.instructorShare > 0) {
            // سهم مدرس از طریق WalletService (ثبت در دفتر کل + totalEarnings)
            await walletService.credit(course.instructor, item.instructorShare, {
              reason: 'instructor_share',
              relatedPayment: payment._id,
              relatedCourse: item.course,
              deltaInstructorEarnings: true,
              session,
            });
          }
        }
      }

      if (payment.paymentMethod !== 'wallet-topup') {
        if (payment.coupon) {
          // ⚠️ FIX: مصرف اتمیک کوپن (جلوگیری از عبور همزمان از سقف مصرف)
          await consumeCouponAtomically(payment.coupon, payment.user, payment._id, session);
        }

        // سبد خرید فقط برای خرید دوره خالی می‌شود — نه برای شارژ کیف پول
        await Cart.findOneAndUpdate(
          { user: payment.user },
          { $set: { items: [], discountAmount: 0, finalPrice: 0 } },
          { session },
        );
      }
    });

    // اعلان‌ها بعد از کامیت — خطای نوتیفیکیشن نباید عملیات را متوقف کند
    try {
      const courses = await Course.find({ _id: { $in: payment.items.map((i: any) => i.course) } });
      for (const course of courses) {
        await createNotification({
          recipient: payment.user.toString(),
          type: NotificationType.PAYMENT,
          title: 'پرداخت شما با موفقیت انجام شد',
          message: `دوره "${course.title}" با موفقیت خریداری شد.`,
          link: `/course/${course.slug}`,
        });
        await createNotification({
          recipient: course.instructor.toString(),
          sender: payment.user.toString(),
          type: NotificationType.ENROLLMENT,
          title: 'دانشجوی جدید',
          message: `یک دانشجوی جدید در دوره "${course.title}" ثبت‌نام کرد.`,
          link: `/course/${course.slug}`,
        });
      }
    } catch (notifError) {
      console.error('Notification error (non-fatal):', notifError);
    }
  } catch (txError) {
    // ✅ FIX H5: اختلاف مبلغ = ردِ قطعی (نه خطای موقت) — پولِ مغایر هرگز نهایی نمی‌شود
    if (txError instanceof GatewayAmountMismatchError) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = txError.message;
      try {
        await payment.save();
      } catch (saveError) {
        console.error('CRITICAL: could not persist amount-mismatch state:', saveError);
      }
      paymentLog('VERIFY_AMOUNT_MISMATCH', {
        paymentId: payment._id,
        orderNumber: payment.orderNumber,
        expectedToman: txError.expectedToman,
        actualRial: txError.actualRial,
      });
      throw txError;
    }

    // ⚠️ FIX CRITICAL: پول واقعاً برداشت شده ولی تراکنش DB شکست.
    // پیش‌ز این FAILED ذخیره می‌شد و چون مسیرهای verify فقط PENDING می‌پذیرفتند،
    // پرداختِ واقعی برای همیشه قفل می‌ماند. حالا PENDING می‌ماند تا verify مجدد
    // (POST /payments/verify) یا job تطبیقِ آینده، نهایی‌سازی را کامل کند.
    payment.status = PaymentStatus.PENDING;
    payment.failureReason = undefined;
    recordVerifyFailure(payment, txError);
    if (referenceId) payment.gatewayRefId = String(referenceId);
    try {
      await payment.save();
    } catch (saveError) {
      console.error('CRITICAL: could not persist pending payment state:', saveError);
    }
    console.error(
      'CRITICAL: Payment verified but DB transaction failed (kept PENDING for retry):',
      {
        paymentId: payment._id,
        gatewayPaymentId: payment.gatewayAuthority,
        refId: referenceId,
        error: txError,
      },
    );
    throw txError;
  } finally {
    await session.endSession();
  }
};

// ====================================================================
// 2. CALLBACK (GET /api/v1/payments/callback) — بازگشت مرورگر از NikPal
// ====================================================================
export const callbackPayment = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { paymentId, orderId, status, refId } = req.query as Record<string, string>;

    paymentLog('CALLBACK_RECEIVED', { paymentId, orderId, status, refId });

    // ۱. اعتبارسنجی پارامترها
    if (!paymentId || !status) {
      return res.redirect(`${nikpalConfig.frontendFailureUrl}?error=INVALID_CALLBACK`);
    }

    // ۲. پیدا کردن پرداخت (gatewayAuthority = NikPal paymentId)
    const payment = await Payment.findOne({ gatewayAuthority: paymentId });
    if (!payment) {
      paymentLog('CALLBACK_PAYMENT_NOT_FOUND', { paymentId });
      return res.redirect(`${nikpalConfig.frontendFailureUrl}?error=PAYMENT_NOT_FOUND`);
    }

    // ۳. Idempotency: اگر قبلاً موفق شده
    if (payment.status === PaymentStatus.SUCCESS) {
      paymentLog('CALLBACK_ALREADY_VERIFIED', { paymentId, dbPaymentId: payment._id });
      return res.redirect(`${nikpalConfig.frontendSuccessUrl}?paymentId=${payment._id}`);
    }

    // ۴. اگر وضعیت نهایی دیگر (failed/expired/reversed)
    if (payment.status !== PaymentStatus.PENDING) {
      paymentLog('CALLBACK_INVALID_STATUS', { paymentId, status: payment.status });
      return res.redirect(
        `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=ALREADY_PROCESSED`,
      );
    }

    payment.callbackStatus = status;

    // ۵. بررسی وضعیت callback (هنوز مدرک نهایی نیست)
    // 🔒 وضعیت «نهاییِ» ناموفق باید فقط با استعلام API قطعی شود؛ ورودی مرورگر قابل جعل است
    if (status !== 'PAID') {
      // ⚠️ FIX CRITICAL: خطای موقتِ استعلام/verify نباید پرداخت را برای همیشه FAILED کند —
      // فقط ردِ صریحِ درگاه (NikpalError 4xx) یا پاسخ صریحِ غیر از PAID → FAILED.
      let statusCheck;
      try {
        statusCheck = await nikpalService.getPaymentStatus(paymentId);
      } catch (statusError) {
        if (isExplicitGatewayRejection(statusError)) {
          payment.status = PaymentStatus.FAILED;
          payment.failureReason = `Payment ${status} — gateway status check rejected: ${statusError.message}`;
          await payment.save();
          paymentLog('CALLBACK_STATUS_REJECTED', {
            paymentId,
            dbPaymentId: payment._id,
            error: statusError.message,
          });
        } else {
          // خطای موقت شبکه/سرور — PENDING بماند تا verify مجدد ممکن باشد
          recordVerifyFailure(payment, statusError);
          await payment.save();
          paymentLog('CALLBACK_STATUS_TEMPORARY_ERROR', {
            paymentId,
            dbPaymentId: payment._id,
            error: statusError instanceof Error ? statusError.message : String(statusError),
            verifyAttemptCount: payment.verifyAttemptCount,
          });
        }
        return res.redirect(
          `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=VERIFY_FAILED`,
        );
      }

      payment.callbackStatus = statusCheck.status;

      if (statusCheck.status === 'PAID') {
        // درگاه می‌گوید پرداخت شده — همان مسیر verify را طی کن
        let verifyResult: GatewayVerifyResult;
        try {
          verifyResult = await nikpalService.verifyPayment(paymentId);
        } catch (verifyError) {
          // ⚠️ FIX CRITICAL: خطای موقتِ verify → PENDING بماند؛ ردِ صریحِ درگاه → FAILED
          if (isExplicitGatewayRejection(verifyError)) {
            payment.status = PaymentStatus.FAILED;
            payment.failureReason = `Verify rejected by gateway: ${verifyError.message}`;
            await payment.save();
            paymentLog('CALLBACK_VERIFY_REJECTED', {
              paymentId,
              dbPaymentId: payment._id,
              error: verifyError.message,
            });
          } else {
            recordVerifyFailure(payment, verifyError);
            await payment.save();
            paymentLog('CALLBACK_VERIFY_TEMPORARY_ERROR', {
              paymentId,
              dbPaymentId: payment._id,
              error: verifyError instanceof Error ? verifyError.message : String(verifyError),
              verifyAttemptCount: payment.verifyAttemptCount,
            });
          }
          return res.redirect(
            `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=VERIFY_FAILED`,
          );
        }

        if (verifyResult.status === 'PAID') {
          // تراکنش DB — خطا در آن نباید status را FAILED کند (پول برداشت شده!)
          try {
            await finalizeGatewayPayment(payment, verifyResult.referenceId || refId, verifyResult.amount);
          } catch (finalizeError) {
            // ✅ FIX H5: اختلاف مبلغ → ردِ قطعی با کد اختصاصی
            if (finalizeError instanceof GatewayAmountMismatchError) {
              return res.redirect(
                `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=AMOUNT_MISMATCH`,
              );
            }
            // finalizeGatewayPayment خودش PENDING را حفظ می‌کند و لاگ می‌زند
            return res.redirect(
              `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=DB_ERROR`,
            );
          }
          paymentLog('VERIFY_SUCCESS_AFTER_STATUS_CHECK', {
            paymentId,
            dbPaymentId: payment._id,
            refId: verifyResult.referenceId,
          });
          return res.redirect(`${nikpalConfig.frontendSuccessUrl}?paymentId=${payment._id}`);
        }

        // درگاه صریحاً verify را با وضعیتی غیر از PAID برگرداند → ردِ قطعی
        payment.status = PaymentStatus.FAILED;
        payment.failureReason = `Verify status: ${verifyResult.status}`;
        await payment.save();
        paymentLog('VERIFY_NOT_PAID', { paymentId, verifyStatus: verifyResult.status });
        return res.redirect(
          `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=VERIFY_NOT_PAID`,
        );
      }

      // درگاه صریحاً تأیید کرد پرداخت انجام نشده → ردِ قطعی
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = `Payment ${statusCheck.status} (gateway confirmed)`;
      await payment.save();
      paymentLog('CALLBACK_FAILED', { paymentId, status, dbPaymentId: payment._id });
      return res.redirect(
        `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&status=${status}`,
      );
    }

    // ۶. ✅ Verify نهایی با NikPal API (الزامی — callback به تنهایی مدرک نهایی نیست)
    let verifyResult: GatewayVerifyResult;
    try {
      verifyResult = await nikpalService.verifyPayment(paymentId);
    } catch (verifyError) {
      // ⚠️ FIX CRITICAL: خطای موقتِ verify نباید پرداخت را برای همیشه FAILED کند.
      // فقط ردِ صریحِ درگاه (NikpalError 4xx) → FAILED؛ شبکه/timeout/5xx → PENDING بماند
      // تا کاربر بتواند از POST /payments/verify دوباره تلاش کند.
      if (isExplicitGatewayRejection(verifyError)) {
        payment.status = PaymentStatus.FAILED;
        payment.failureReason = 'Verify rejected by gateway: ' + verifyError.message;
        await payment.save();
        paymentLog('VERIFY_REJECTED', {
          paymentId,
          dbPaymentId: payment._id,
          error: verifyError.message,
        });
      } else {
        recordVerifyFailure(payment, verifyError);
        await payment.save();
        paymentLog('VERIFY_TEMPORARY_ERROR', {
          paymentId,
          dbPaymentId: payment._id,
          error: verifyError instanceof Error ? verifyError.message : String(verifyError),
          verifyAttemptCount: payment.verifyAttemptCount,
        });
      }
      return res.redirect(
        `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=VERIFY_FAILED`,
      );
    }

    if (verifyResult.status !== 'PAID') {
      // درگاه صریحاً پاسخ داد (بدون خطا) که وضعیت نهایی، غیر از PAID است → ردِ قطعی
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = `Verify status: ${verifyResult.status}`;
      await payment.save();
      paymentLog('VERIFY_NOT_PAID', { paymentId, verifyStatus: verifyResult.status });
      return res.redirect(
        `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=VERIFY_NOT_PAID`,
      );
    }

    // ۷. تراکنش MongoDB — پرداخت + ثبت‌نام + سهم مدرس + کوپن + سبد
    try {
      await finalizeGatewayPayment(payment, verifyResult.referenceId || refId, verifyResult.amount);
    } catch (finalizeError) {
      // ✅ FIX H5: اختلاف مبلغ تأییدشده درگاه با مبلغ سفارش → ردِ قطعی
      if (finalizeError instanceof GatewayAmountMismatchError) {
        return res.redirect(
          `${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=AMOUNT_MISMATCH`,
        );
      }
      return res.redirect(`${nikpalConfig.frontendFailureUrl}?paymentId=${payment._id}&error=DB_ERROR`);
    }

    paymentLog('VERIFY_SUCCESS', {
      paymentId,
      dbPaymentId: payment._id,
      refId: verifyResult.referenceId,
      amount: payment.finalAmount,
    });

    return res.redirect(`${nikpalConfig.frontendSuccessUrl}?paymentId=${payment._id}`);
  } catch (error) {
    console.error('Callback error:', error);
    return res.redirect(`${nikpalConfig.frontendFailureUrl}?error=INTERNAL_ERROR`);
  }
});

// ====================================================================
// 3. VERIFY PAYMENT (POST)
// ====================================================================
export const verifyPaymentEndpoint = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const paymentId = (req.body.paymentId || req.body.authority) as string | undefined;
  const gatewayStatus = req.body.status as string | undefined;

  if (!paymentId) throw ApiError.badRequest('شناسه تراکنش (paymentId) الزامی است');

  const payment = await Payment.findOne({ gatewayAuthority: paymentId });
  if (!payment) throw ApiError.notFound('تراکنش یافت نشد');

  // 🔒 ضد IDOR: فقط صاحب تراکنش (یا ادمین) می‌تواند آن را تأیید/رد کند
  const isOwner = payment.user?.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('شما به این تراکنش دسترسی ندارید');
  }

  if (payment.status === PaymentStatus.SUCCESS) {
    return ApiResponse.success(res, payment, 'این تراکنش قبلاً تأیید شده است');
  }

  // ⚠️ FIX CRITICAL: علاوه بر PENDING، تراکنش‌های FAILED «قابل بازیابی» هم پذیرفته
  // می‌شوند (خطای موقتِ verify که قبلاً به‌اشتباه FAILED ذخیره شده بود) تا پول
  // پرداخت‌شده قفل نماند: کمتر از ۵ تلاش ناموفق + آخرین تلاش در پنجره‌ی ۲۴ ساعته.
  if (payment.status === PaymentStatus.FAILED && isRecoverableFailed(payment)) {
    paymentLog('VERIFY_ENDPOINT_RECOVERABLE_FAILED', {
      paymentId,
      dbPaymentId: payment._id,
      previousAttempts: payment.verifyAttemptCount || 0,
      lastVerifyError: payment.lastVerifyError,
    });
  } else if (payment.status !== PaymentStatus.PENDING) {
    throw ApiError.badRequest('این تراکنش قابل تأیید نیست');
  }

  // اگر وضعیت صراحتاً غیر از PAID ارسال شده باشد
  if (gatewayStatus && gatewayStatus !== 'PAID') {
    payment.status = PaymentStatus.FAILED;
    payment.failureReason = `وضعیت درگاه: ${gatewayStatus}`;
    await payment.save();
    throw ApiError.badRequest('پرداخت ناموفق بود');
  }

  // ✅ Verify نهایی با NikPal API (الزامی)
  let verifyResult: GatewayVerifyResult;
  try {
    verifyResult = await nikpalService.verifyPayment(paymentId);
  } catch (error) {
    // ⚠️ FIX CRITICAL: فقط ردِ صریحِ درگاه (NikpalError 4xx) → FAILED؛ خطای
    // شبکه/timeout/5xx موقتی است و پرداخت PENDING می‌ماند تا تلاش مجدد ممکن باشد.
    if (isExplicitGatewayRejection(error)) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = `خطای verify: ${error.message}`;
      await payment.save();
      paymentLog('VERIFY_ENDPOINT_REJECTED', {
        paymentId,
        dbPaymentId: payment._id,
        error: error.message,
        errorCode: error.errorCode,
      });
      throw ApiError.badRequest('پرداخت توسط درگاه پرداخت رد شد');
    }

    // خطای موقت شبکه/سرور — PENDING بماند + ثبت خطا برای عیب‌یابی
    recordVerifyFailure(payment, error);
    await payment.save();
    paymentLog('VERIFY_ENDPOINT_TEMPORARY_ERROR', {
      paymentId,
      dbPaymentId: payment._id,
      error: error instanceof Error ? error.message : String(error),
      verifyAttemptCount: payment.verifyAttemptCount,
    });
    throw ApiError.internal(
      'خطای موقت در ارتباط با درگاه پرداخت؛ لطفاً چند لحظه دیگر دوباره تلاش کنید',
    );
  }

  if (verifyResult.status !== 'PAID') {
    payment.status = PaymentStatus.FAILED;
    payment.failureReason = `Verify status: ${verifyResult.status}`;
    await payment.save();
    throw ApiError.badRequest('پرداخت تأیید نشد');
  }

  // تراکنش MongoDB: پرداخت + ثبت‌نام + سهم مدرس + کوپن + سبد
  try {
    await finalizeGatewayPayment(payment, verifyResult.referenceId, verifyResult.amount);
  } catch (error) {
    // ✅ FIX H5: مبلغ مغایر درگاه → پاسخ 400 صریح (نه 500 گمراه‌کننده)
    if (error instanceof GatewayAmountMismatchError) {
      paymentLog('VERIFY_ENDPOINT_AMOUNT_MISMATCH', {
        paymentId,
        expectedToman: error.expectedToman,
        actualRial: error.actualRial,
      });
      throw ApiError.badRequest(error.message);
    }
    paymentLog('VERIFY_ENDPOINT_TX_FAILED', {
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw ApiError.internal(
      'پرداخت انجام شد ولی ثبت نتیجه ناموفق بود؛ لطفاً با پشتیبانی تماس بگیرید',
    );
  }

  paymentLog('VERIFY_ENDPOINT_SUCCESS', {
    paymentId,
    refId: verifyResult.referenceId,
    amount: payment.finalAmount,
  });

  return ApiResponse.success(
    res,
    {
      paymentId: payment._id,
      orderNumber: payment.orderNumber,
      status: verifyResult.status,
      amount: verifyResult.amount,
      referenceId: verifyResult.referenceId,
    },
    'پرداخت با موفقیت تأیید شد',
  );
});

// ====================================================================
// 4. PAYMENT HISTORY
// ====================================================================
export const paymentHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const userId = req.user._id;
  // [MULTI-TENANT-DISABLED] const tenantId = req.tenantId!;
  const { page, limit, skip, sort } = getPaginationOptions(req);

  const filter: Record<string, any> = { user: userId };
  // [MULTI-TENANT-DISABLED] tenant: tenantId removed from filter
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const payments = await Payment.find(filter)
    .populate('items.course', 'title slug thumbnail')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await Payment.countDocuments(filter);
  return ApiResponse.paginated(res, payments, page, limit, total, 'تاریخچه پرداخت‌ها');
});

// ====================================================================
// 5. PAYMENT DETAILS
// ====================================================================
export const getPaymentDetails = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  // [MULTI-TENANT-DISABLED] const tenantId = req.tenantId!;

  const payment = await Payment.findOne({ _id: id })
  // [MULTI-TENANT-DISABLED] tenant: tenantId removed from filter
    .populate('items.course', 'title slug thumbnail instructor')
    .populate('coupon', 'code discountType discountValue');

  if (!payment) throw ApiError.notFound('تراکنش یافت نشد');

  const isOwner = payment.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === UserRole.ADMIN;
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('شما دسترسی به این تراکنش ندارید');
  }

  return ApiResponse.success(res, payment);
});

// ====================================================================
// 6. ADMIN: ALL PAYMENTS
// ====================================================================
export const adminAllPayments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    throw ApiError.forbidden('فقط ادمین به این بخش دسترسی دارد');
  }

  const { page, limit, skip, sort } = getPaginationOptions(req);
  const filter: Record<string, any> = {};

  if (req.query.status) filter.status = req.query.status;
  // [MULTI-TENANT-DISABLED] if (req.query.tenantId) filter.tenant = req.query.tenantId;
  if (req.query.courseId) filter['items.course'] = req.query.courseId;
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate as string);
    if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate as string);
  }

  const payments = await Payment.find(filter)
    .populate('user', 'fullName email avatar')
    .populate('items.course', 'title slug thumbnail')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await Payment.countDocuments(filter);
  return ApiResponse.paginated(res, payments, page, limit, total, 'لیست پرداخت‌ها');
});

// ====================================================================
// 7. ADMIN: PAYMENT STATS
// ====================================================================
export const adminPaymentStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    throw ApiError.forbidden('فقط ادمین به این بخش دسترسی دارد');
  }

  const matchFilter: Record<string, any> = {};
  // [MULTI-TENANT-DISABLED] if (req.query.tenantId) {
  // [MULTI-TENANT-DISABLED]   matchFilter.tenant = new mongoose.Types.ObjectId(req.query.tenantId as string);
  // [MULTI-TENANT-DISABLED] }
  if (req.query.startDate || req.query.endDate) {
    matchFilter.createdAt = {};
    if (req.query.startDate) matchFilter.createdAt.$gte = new Date(req.query.startDate as string);
    if (req.query.endDate) matchFilter.createdAt.$lte = new Date(req.query.endDate as string);
  }

  // ⚠️ شارژ کیف پول (wallet-topup) پولی است که کاربر خودش وارد کرده؛ درآمد
  // پلتفرم نیست — نباید در totalRevenue لحاظ شود
  matchFilter.paymentMethod = { $ne: 'wallet-topup' };

  const [statsResult] = await Payment.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalRevenue: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, '$finalAmount', 0] },
        },
        successCount: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        reversedCount: { $sum: { $cond: [{ $eq: ['$status', 'reversed'] }, 1, 0] } },
        expiredCount: { $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] } },
        totalFees: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, { $ifNull: ['$fee', 0] }, 0] },
        },
      },
    },
  ]);

  const byStatus = await Payment.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$finalAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const stats = statsResult || {
    totalTransactions: 0, totalRevenue: 0, successCount: 0, failedCount: 0,
    pendingCount: 0, reversedCount: 0, expiredCount: 0, totalFees: 0,
  };

  const successRate =
    stats.totalTransactions > 0
      ? Math.round((stats.successCount / stats.totalTransactions) * 100)
      : 0;

  return ApiResponse.success(res, { ...stats, successRate, byStatus });
});

// ====================================================================
// 8. ADMIN: REFUND
// ====================================================================
export const adminRefund = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    throw ApiError.forbidden('فقط ادمین به این بخش دسترسی دارد');
  }

  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw ApiError.badRequest('دلیل بازپرداخت الزامی است (حداقل 5 کاراکتر)');
  }

  // ⚠️ FIX CRITICAL: کل منطق بازپرداخت به سرویس واحد (refundService) منتقل شد.
  // نسخه‌ی قدیمیِ این متد مشکلات زیر را داشت:
  //  ۱. فقط وضعیت را REVERSED می‌کرد — پول واقعاً برنمی‌گشت و سهم مدرس کسر نمی‌شد
  //  ۲. Enrollment را با findOneAndDelete «حذف فیزیکی» می‌کرد (پیشرفت دانشجو نابود می‌شد)
  //  ۳. بدون تراکنش اتمیک (وضعیت نیمه‌کاره در وسط کار)
  //  ۴. هویت ادمین فقط در کنسول لاگ می‌شد، در سند ذخیره نمی‌شد
  //  ۵. Course.totalRevenue برنمی‌گشت (درآمد مدرس کاذب می‌ماند)
  const result = await refundService.processRefund(id, req.user._id.toString(), reason);

  paymentLog('ADMIN_REFUND', {
    paymentId: id,
    adminId: req.user._id,
    moneyReturned: result.moneyReturned,
    instructorDeducted: result.instructorDeducted,
    couponRestored: result.couponRestored,
  });

  return ApiResponse.success(res, result, 'بازپرداخت با موفقیت پردازش شد');
});

// ====================================================================
// 9. FEE CALCULATION
// ====================================================================

  // ⚠️ FIX HIGH: پیش از این، با بازپرداخت، شمارنده و سابقه‌ی مصرف کوپون بازنشسته نمی‌شد.
  // نتیجه: سقف مصرف کوپون نادرست می‌شد و کاربر می‌توانست دوباره از همان کد استفاده کند.
export const calculateFee = asyncHandler(async (req: Request, res: Response) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return ApiResponse.error(res, 'مبلغ نامعتبر', 422);
  }

  // NikPal کارمزد را در لحظه پرداخت محاسبه می‌کند.
  // فعلاً کارمزد صفر برمی‌گردانیم.
  return ApiResponse.success(res, {
    amount,
    fee: 0,
    feeType: 'none',
    total: amount,
  });
});

// ====================================================================
// 10. INQUIRY
// ====================================================================
export const inquiryPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;

  const payment = await Payment.findOne({ _id: id });
  if (!payment) throw ApiError.notFound('تراکنش یافت نشد');

  const isOwner = payment.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === UserRole.ADMIN;
  if (!isOwner && !isAdmin) throw ApiError.forbidden('شما دسترسی به این تراکنش ندارید');

  if (!payment.gatewayAuthority) throw ApiError.badRequest('این تراکنش شناسه درگاه ندارد');

  // استعلام وضعیت از NikPal (GET /api/v1/payments/:paymentId)
  try {
    const status = await nikpalService.getPaymentStatus(payment.gatewayAuthority);
    return ApiResponse.success(res, {
      paymentId: payment._id,
      authority: payment.gatewayAuthority,
      status: status.status,
      amount: status.amount,
      referenceId: status.referenceId,
      createdAt: status.createdAt,
      paidAt: status.paidAt,
    });
  } catch (error) {
    return ApiResponse.error(
      res,
      error instanceof Error ? error.message : 'خطا در استعلام پرداخت',
      500,
    );
  }
});

// ====================================================================
// 11. REVERSE (Admin only)
// ====================================================================
export const reversePaymentEndpoint = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== UserRole.ADMIN) {
    throw ApiError.forbidden('فقط ادمین به این بخش دسترسی دارد');
  }

  const { id } = req.params;
  const { reason } = req.body;

  // ⚠️ FIX CRITICAL: نسخه‌ی قدیمی فقط وضعیت را عوض می‌کرد — دانشجو بعد از
  // «بازپرداخت» همچنان به دوره دسترسی داشت، کوپن باز نمی‌گشت و سهم مدرس
  // کسر نمی‌شد. حالا همان سرویس واحد بازپرداخت اجرا می‌شود (مسیر دوم نگه
  // داشته نشد تا دو مسیر بازپرداخت متناقض وجود نداشته باشد).
  const finalReason =
    typeof reason === 'string' && reason.trim().length >= 5
      ? reason.trim()
      : 'برگشت توسط ادمین';

  const result = await refundService.processRefund(id, req.user._id.toString(), finalReason);

  paymentLog('REVERSE_ENDPOINT', {
    paymentId: id,
    adminId: req.user._id,
    moneyReturned: result.moneyReturned,
    instructorDeducted: result.instructorDeducted,
  });

  return ApiResponse.success(res, result, 'بازپرداخت با موفقیت پردازش شد');
});

// ====================================================================
// 12. EXPIRE PENDING PAYMENTS (Cron Job)
// ====================================================================
export const expirePendingPayments = async () => {
  const expiryDate = new Date(Date.now() - PENDING_EXPIRY_MINUTES * 60 * 1000);

  const result = await Payment.updateMany(
    { status: PaymentStatus.PENDING, createdAt: { $lt: expiryDate } },
    { $set: { status: PaymentStatus.EXPIRED, failureReason: 'پرداخت در مهلت مقرر انجام نشد' } },
  );

  if (result.modifiedCount > 0) {
    console.log(`⏰ [PAYMENT] ${result.modifiedCount} پرداخت منقضی شده پاکسازی شد`);
  }

  return result.modifiedCount;
};
