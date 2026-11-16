/**
 * 🧮 سرویس متمرکز قیمت‌گذاری و تخفیف
 *
 * این سرویس تنها منبع معتبر برای محاسبه قیمت نهایی دوره‌ها است.
 * تمام بخش‌های سیستم (Course Virtual, Cart, Payment, Order) باید
 * از این سرویس استفاده کنند تا فرمول تخفیف یکسان باشد.
 *
 * ⚠️ اصل حیاتی: Server-Side Time منبع حقیقت زمان است.
 * هرگز به Date.now() کلاینت یا Request Body اعتماد نکن.
 */

import { ICourse } from '../models/Course';
import { ICampaign } from '../models/Campaign';
import { MAX_TOTAL_DISCOUNT_PERCENT, getMinimumAllowedPrice } from '../config/discount.config';
import { isCourseInCampaignScope } from './campaign.service';

// ==================== Types ====================

export type DiscountType = 'none' | 'manual' | 'countdown';

export interface ICountdownDiscount {
  enabled: boolean;
  startAt: Date;
  endAt: Date;
  initialPercent: number;
  finalPercent: number;
  mode: 'linear' | 'step';
  stepIntervalMinutes?: number;
  stepPercent?: number;
}

export interface IPricingResult {
  originalPrice: number;
  discountType: DiscountType;
  currentDiscountPercent: number;
  currentPrice: number;
  serverTime: Date;
  discountStartAt?: Date;
  discountEndAt?: Date;
  discountActive: boolean;
  // Manual discount fields
  discountPrice?: number;
  // Countdown specific
  countdownProgress?: number; // 0 to 1
  countdownMode?: 'linear' | 'step';
  // ⭐ فیلدهای ضروری برای محاسبه زنده دقیق در فرانت‌اند
  initialPercent?: number;
  finalPercent?: number;
  stepPercent?: number;
  stepIntervalMinutes?: number;
  // Campaign fields (D2: Best-of strategy)
  campaignApplied?: boolean;
  campaignDiscountPercent?: number;
  priceBeforeCampaign?: number;
}

// ==================== Constants ====================

const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

// ==================== Helper Functions ====================

/**
 * Clamp a number between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Validate that a value is a finite number
 */
function isValidNumber(value: any): boolean {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
}

// ==================== Countdown Discount Calculation ====================

/**
 * محاسبه درصد تخفیف فعلی در حالت Countdown
 *
 * @param countdown - تنظیمات تخفیف معکوس زمان‌دار
 * @param serverTime - زمان جاری سرور (معتبرترین منبع)
 * @returns درصد تخفیف فعلی (بین finalPercent و initialPercent)
 */
export function calculateCountdownPercent(
  countdown: ICountdownDiscount,
  serverTime: Date = new Date(),
): number {
  if (!countdown.enabled) {
    return 0;
  }

  const now = serverTime.getTime();
  const startAt = new Date(countdown.startAt).getTime();
  const endAt = new Date(countdown.endAt).getTime();

  // ─── قبل از شروع کمپین ───
  if (now < startAt) {
    return 0;
  }

  // ─── بعد از پایان کمپین ───
  if (now >= endAt) {
    return countdown.finalPercent;
  }

  // ─── در زمان کمپین ───
  const totalDuration = endAt - startAt;
  const elapsed = now - startAt;
  const progress = clamp(elapsed / totalDuration, 0, 1);

  if (countdown.mode === 'step') {
    return calculateStepDiscount(countdown, progress);
  }

  // Linear mode
  return calculateLinearDiscount(countdown, progress);
}

/**
 * محاسبه تخفیف در حالت خطی (Linear)
 *
 * فرمول:
 *   currentDiscount = initialPercent - (progress * (initialPercent - finalPercent))
 *
 * مثال:
 *   initial=100, final=0, progress=0.5 → currentDiscount=50
 */
function calculateLinearDiscount(
  countdown: ICountdownDiscount,
  progress: number,
): number {
  const { initialPercent, finalPercent } = countdown;
  const currentDiscount =
    initialPercent - progress * (initialPercent - finalPercent);
  return clamp(currentDiscount, finalPercent, initialPercent);
}

/**
 * محاسبه تخفیف در حالت مرحله‌ای (Step)
 *
 * تخفیف در بازه‌های زمانی مشخص کاهش می‌یابد.
 * مثال:
 *   initial=100, stepPercent=10, stepIntervalMinutes=30
 *   → 100%, 90%, 80%, ..., 0%
 */
function calculateStepDiscount(
  countdown: ICountdownDiscount,
  progress: number,
): number {
  const { initialPercent, finalPercent, stepPercent, stepIntervalMinutes } =
    countdown;

  if (!stepPercent || !stepIntervalMinutes) {
    return initialPercent;
  }

  const totalDurationMs =
    new Date(countdown.endAt).getTime() - new Date(countdown.startAt).getTime();
  const stepIntervalMs = stepIntervalMinutes * 60 * 1000;
  const totalSteps = Math.floor(totalDurationMs / stepIntervalMs);

  if (totalSteps <= 0) {
    return initialPercent;
  }

  const currentStep = Math.floor(progress * totalSteps);
  const discountDecrease = currentStep * stepPercent;
  const currentDiscount = initialPercent - discountDecrease;

  return clamp(currentDiscount, finalPercent, initialPercent);
}

// ==================== Main Pricing Function ====================

/**
 * تابع مرکزی محاسبه قیمت نهایی دوره
 *
 * این تابع باید در تمام بخش‌های سیستم استفاده شود:
 * - Course Virtual (currentPrice)
 * - Cart (recalculateCart)
 * - Payment (calculateCoursePrice)
 * - Order (price snapshot)
 *
 * @param course - آبجکت دوره (از دیتابیس)
 * @param serverTime - زمان جاری سرور (اختیاری، پیش‌فرض new Date())
 * @param activeCampaign - کمپین فعال سراسری (اختیاری، برای Best-of strategy)
 * @returns IPricingResult - اطلاعات کامل قیمت و تخفیف
 */
export function calculateCoursePricing(
  course: Pick<
    ICourse,
    | 'price'
    | 'discountPrice'
    | 'discountEndsAt'
    | 'isFree'
    | 'discountType'
    | 'countdownDiscount'
    | 'category'
  >,
  serverTime: Date = new Date(),
  activeCampaign?: ICampaign | null,
): IPricingResult {
  const originalPrice = course.isFree ? 0 : Math.max(0, course.price || 0);

  // ─── دوره رایگان ───
  if (course.isFree) {
    return {
      originalPrice: 0,
      discountType: 'none',
      currentDiscountPercent: 0,
      currentPrice: 0,
      serverTime,
      discountActive: false,
    };
  }

  // 🎯 فیلتر scope کمپین — اگر دوره خارج از محدودهٔ کمپین باشد، کمپین اعمال نمی‌شود
  // (scope='all' → همه؛ scope='categories' → فقط دسته‌های مجاز؛ excludedCourses → حذف)
  const scopedCampaign =
    activeCampaign && isCourseInCampaignScope(course as any, activeCampaign)
      ? activeCampaign
      : null;
  const campaign = scopedCampaign;

  // ─── Countdown Discount ───
  if (
    course.discountType === 'countdown' &&
    course.countdownDiscount?.enabled
  ) {
    const cd = course.countdownDiscount;
    const now = serverTime.getTime();
    const startAt = new Date(cd.startAt).getTime();
    const endAt = new Date(cd.endAt).getTime();

    // قبل از شروع کمپین
    if (now < startAt) {
      return applyCampaignIfBetter({
        originalPrice,
        discountType: 'countdown',
        currentDiscountPercent: 0,
        currentPrice: originalPrice,
        serverTime,
        discountStartAt: cd.startAt,
        discountEndAt: cd.endAt,
        discountActive: false,
        countdownProgress: 0,
        countdownMode: cd.mode,
        initialPercent: cd.initialPercent,
        finalPercent: cd.finalPercent,
        stepPercent: cd.stepPercent,
        stepIntervalMinutes: cd.stepIntervalMinutes,
      }, campaign, serverTime);
    }

    // بعد از پایان کمپین
    if (now >= endAt) {
      return applyCampaignIfBetter({
        originalPrice,
        discountType: 'countdown',
        currentDiscountPercent: cd.finalPercent,
        currentPrice: Math.round(
          originalPrice * (1 - cd.finalPercent / 100),
        ),
        serverTime,
        discountStartAt: cd.startAt,
        discountEndAt: cd.endAt,
        discountActive: false,
        countdownProgress: 1,
        countdownMode: cd.mode,
        initialPercent: cd.initialPercent,
        finalPercent: cd.finalPercent,
        stepPercent: cd.stepPercent,
        stepIntervalMinutes: cd.stepIntervalMinutes,
      }, campaign, serverTime);
    }

    // در زمان کمپین
    const totalDuration = endAt - startAt;
    const elapsed = now - startAt;
    const progress = clamp(elapsed / totalDuration, 0, 1);
    const currentPercent = calculateCountdownPercent(cd, serverTime);
    const currentPrice = Math.round(
      originalPrice * (1 - currentPercent / 100),
    );

    return applyCampaignIfBetter({
      originalPrice,
      discountType: 'countdown',
      currentDiscountPercent: currentPercent,
      currentPrice,
      serverTime,
      discountStartAt: cd.startAt,
      discountEndAt: cd.endAt,
      discountActive: currentPercent > 0,
      countdownProgress: progress,
      countdownMode: cd.mode,
      initialPercent: cd.initialPercent,
      finalPercent: cd.finalPercent,
      stepPercent: cd.stepPercent,
      stepIntervalMinutes: cd.stepIntervalMinutes,
    }, campaign, serverTime);
  }

  // ─── Manual Discount ───
  if (
    course.discountPrice &&
    course.discountPrice > 0 &&
    course.discountPrice < originalPrice &&
    course.discountEndsAt &&
    new Date(course.discountEndsAt) > serverTime
  ) {
    const discountPercent = Math.round(
      ((originalPrice - course.discountPrice) / originalPrice) * 100,
    );
    // Apply campaign on top of manual discount (Best-of strategy)
    return applyCampaignIfBetter({
      originalPrice,
      discountType: 'manual',
      currentDiscountPercent: discountPercent,
      currentPrice: course.discountPrice,
      serverTime,
      discountEndAt: course.discountEndsAt,
      discountActive: true,
      discountPrice: course.discountPrice,
    }, campaign, serverTime);
  }

  // ─── Countdown Discount ───
  // (already handled above, but we need to apply campaign on top)
  // The countdown logic already returns, so we need to wrap it
  // Actually, the countdown logic is above and returns early. We need to modify it to apply campaign.
  // Let me restructure: compute course's own price first, then apply campaign.

  // ─── بدون تخفیف ───
  const baseResult = {
    originalPrice,
    discountType: 'none' as DiscountType,
    currentDiscountPercent: 0,
    currentPrice: originalPrice,
    serverTime,
    discountActive: false,
  };

  return applyCampaignIfBetter(baseResult, campaign, serverTime);
}

/**
 * 🎯 Best-of Strategy: Apply campaign discount if it yields a better price
 * than the course's own discount.
 *
 * D2 Business Rule: Compare course's own discounted price with campaign price,
 * pick the LOWER one. Never stack campaign on top of course's own discount.
 *
 * Also enforces D1: Total discount (course + campaign) capped at MAX_TOTAL_DISCOUNT_PERCENT.
 */
function applyCampaignIfBetter(
  baseResult: IPricingResult,
  activeCampaign: ICampaign | null | undefined,
  serverTime: Date,
): IPricingResult {
  // No active campaign or campaign not applicable
  if (!activeCampaign || !activeCampaign.isActive) {
    return baseResult;
  }

  // Check if campaign is within its time window
  const now = serverTime.getTime();
  const startAt = new Date(activeCampaign.startAt).getTime();
  const endAt = new Date(activeCampaign.endAt).getTime();
  if (now < startAt || now >= endAt) {
    return baseResult;
  }

  // ⚠️ بررسی scope (scope='all' / 'categories' / excludedCourses)
  // در `calculateCoursePricing` انجام می‌شود و کمپین فیلترشده به اینجا می‌رسد.

  // Compute campaign price
  const campaignPrice = computeCampaignPrice(
    baseResult.currentPrice,
    baseResult.originalPrice,
    activeCampaign
  );

  // D1: Enforce maximum total discount cap
  const minimumAllowedPrice = getMinimumAllowedPrice(baseResult.originalPrice);
  const finalPrice = Math.max(campaignPrice, minimumAllowedPrice);

  // D2 Best-of: pick the lower price (better for user)
  if (finalPrice < baseResult.currentPrice) {
    const campaignDiscountPercent = Math.round(
      ((baseResult.originalPrice - finalPrice) / baseResult.originalPrice) * 100
    );
    return {
      ...baseResult,
      currentPrice: finalPrice,
      currentDiscountPercent: campaignDiscountPercent,
      discountActive: true,
      campaignApplied: true,
      campaignDiscountPercent,
      priceBeforeCampaign: baseResult.currentPrice,
    };
  }

  // Course's own discount is better or equal
  return baseResult;
}

/**
 * Compute the campaign price for a course.
 * Applies percentage or fixed discount, respects maxDiscount cap.
 * Returns the new price (floored to integer Rial), never negative.
 */
function computeCampaignPrice(
  baseCurrentPrice: number,
  originalPrice: number,
  campaign: ICampaign
): number {
  let discountedPrice: number;

  if (campaign.discountType === 'percentage') {
    const discountAmount = Math.floor((baseCurrentPrice * campaign.discountValue) / 100);
    const cappedDiscount = campaign.maxDiscount
      ? Math.min(discountAmount, campaign.maxDiscount)
      : discountAmount;
    discountedPrice = baseCurrentPrice - cappedDiscount;
  } else {
    // fixed discount
    discountedPrice = baseCurrentPrice - campaign.discountValue;
  }

  // Never go below zero
  return Math.max(0, Math.floor(discountedPrice));
}

// ==================== Validation ====================

export interface CountdownValidationError {
  field: string;
  message: string;
}

/**
 * اعتبارسنجی تنظیمات تخفیف معکوس زمان‌دار
 */
export function validateCountdownDiscount(
  data: Partial<ICountdownDiscount>,
): CountdownValidationError[] {
  const errors: CountdownValidationError[] = [];

  if (!data.enabled) {
    return errors; // اگر غیرفعال است، نیازی به اعتبارسنجی نیست
  }

  // ─── startAt ───
  if (!data.startAt) {
    errors.push({ field: 'startAt', message: 'تاریخ شروع کمپین الزامی است' });
  } else {
    const startDate = new Date(data.startAt);
    if (isNaN(startDate.getTime())) {
      errors.push({ field: 'startAt', message: 'تاریخ شروع معتبر نیست' });
    }
  }

  // ─── endAt ───
  if (!data.endAt) {
    errors.push({ field: 'endAt', message: 'تاریخ پایان کمپین الزامی است' });
  } else {
    const endDate = new Date(data.endAt);
    if (isNaN(endDate.getTime())) {
      errors.push({ field: 'endAt', message: 'تاریخ پایان معتبر نیست' });
    }
  }

  // ─── startAt < endAt ───
  if (data.startAt && data.endAt) {
    const start = new Date(data.startAt).getTime();
    const end = new Date(data.endAt).getTime();
    if (isFinite(start) && isFinite(end) && start >= end) {
      errors.push({
        field: 'endAt',
        message: 'تاریخ پایان باید بعد از تاریخ شروع باشد',
      });
    }
  }

  // ─── initialPercent ───
  if (!isValidNumber(data.initialPercent)) {
    errors.push({
      field: 'initialPercent',
      message: 'درصد تخفیف اولیه باید یک عدد معتبر باشد',
    });
  } else if (data.initialPercent! < MIN_PERCENT || data.initialPercent! > MAX_PERCENT) {
    errors.push({
      field: 'initialPercent',
      message: `درصد تخفیف اولیه باید بین ${MIN_PERCENT} و ${MAX_PERCENT} باشد`,
    });
  }

  // ─── finalPercent ───
  if (!isValidNumber(data.finalPercent)) {
    errors.push({
      field: 'finalPercent',
      message: 'درصد تخفیف نهایی باید یک عدد معتبر باشد',
    });
  } else if (
    data.finalPercent! < MIN_PERCENT ||
    data.finalPercent! > MAX_PERCENT
  ) {
    errors.push({
      field: 'finalPercent',
      message: `درصد تخفیف نهایی باید بین ${MIN_PERCENT} و ${MAX_PERCENT} باشد`,
    });
  }

  // ─── finalPercent <= initialPercent ───
  if (
    isValidNumber(data.initialPercent) &&
    isValidNumber(data.finalPercent) &&
    data.finalPercent! > data.initialPercent!
  ) {
    errors.push({
      field: 'finalPercent',
      message: 'درصد تخفیف نهایی نمی‌تواند بیشتر از درصد تخفیف اولیه باشد',
    });
  }

  // ─── mode ───
  if (data.mode && !['linear', 'step'].includes(data.mode)) {
    errors.push({
      field: 'mode',
      message: 'حالت کاهش باید linear یا step باشد',
    });
  }

  // ─── Step-specific validations ───
  if (data.mode === 'step') {
    if (!isValidNumber(data.stepPercent) || data.stepPercent! <= 0) {
      errors.push({
        field: 'stepPercent',
        message: 'مقدار کاهش در حالت مرحله‌ای باید بزرگتر از 0 باشد',
      });
    }
    if (
      !isValidNumber(data.stepIntervalMinutes) ||
      data.stepIntervalMinutes! <= 0
    ) {
      errors.push({
        field: 'stepIntervalMinutes',
        message: 'فاصله کاهش در حالت مرحله‌ای باید بزرگتر از 0 باشد',
      });
    }
  }

  return errors;
}