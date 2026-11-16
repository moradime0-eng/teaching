/// <reference types="jest" />
/**
 * 🧮 تست‌های سرویس قیمت‌گذاری — توابع خالص، بدون دیتابیس
 *
 * پوشش: قیمت پایه، تخفیف دستی، تخفیف معکوس خطی/مرحله‌ای، clamp درصدها،
 * انقضای کمپین و اعتبارسنجی تنظیمات تخفیف.
 */
import {
  calculateCoursePricing,
  calculateCountdownPercent,
  validateCountdownDiscount,
  ICountdownDiscount,
} from '../services/pricing.service';

const HOUR_MS = 60 * 60 * 1000;

function makeCountdown(overrides: Partial<ICountdownDiscount> = {}): ICountdownDiscount {
  return {
    enabled: true,
    startAt: new Date(Date.now() - HOUR_MS),
    endAt: new Date(Date.now() + HOUR_MS),
    initialPercent: 50,
    finalPercent: 10,
    mode: 'linear',
    ...overrides,
  };
}

describe('Pricing Service', () => {
  describe('calculateCoursePricing — قیمت پایه و تخفیف دستی', () => {
    it('should return base price when no discount', () => {
      const result = calculateCoursePricing({
        price: 150000,
        discountType: 'none',
        isFree: false,
      } as any);

      expect(result.originalPrice).toBe(150000);
      expect(result.currentPrice).toBe(150000);
      expect(result.currentDiscountPercent).toBe(0);
      expect(result.discountType).toBe('none');
      expect(result.discountActive).toBe(false);
    });

    it('should return zero price for free courses', () => {
      const result = calculateCoursePricing({
        price: 99000,
        isFree: true,
      } as any);

      expect(result.originalPrice).toBe(0);
      expect(result.currentPrice).toBe(0);
      expect(result.currentDiscountPercent).toBe(0);
    });

    it('should apply manual discount while valid', () => {
      const result = calculateCoursePricing({
        price: 200000,
        discountPrice: 150000,
        discountEndsAt: new Date(Date.now() + HOUR_MS),
        discountType: 'manual',
        isFree: false,
      } as any);

      expect(result.discountType).toBe('manual');
      expect(result.currentPrice).toBe(150000);
      expect(result.currentDiscountPercent).toBe(25);
      expect(result.discountActive).toBe(true);
    });

    it('should ignore expired manual discount', () => {
      const result = calculateCoursePricing({
        price: 200000,
        discountPrice: 150000,
        discountEndsAt: new Date(Date.now() - HOUR_MS),
        discountType: 'manual',
        isFree: false,
      } as any);

      expect(result.discountType).toBe('none');
      expect(result.currentPrice).toBe(200000);
      expect(result.discountActive).toBe(false);
    });

    it('should ignore discountPrice greater or equal to base price', () => {
      const result = calculateCoursePricing({
        price: 100000,
        discountPrice: 100000,
        discountEndsAt: new Date(Date.now() + HOUR_MS),
        discountType: 'manual',
        isFree: false,
      } as any);

      expect(result.discountType).toBe('none');
      expect(result.currentPrice).toBe(100000);
    });
  });

  describe('calculateCoursePricing — تخفیف معکوس (Countdown)', () => {
    it('should calculate linear countdown discount at campaign midpoint', () => {
      const now = Date.now();
      const course = {
        price: 100000,
        isFree: false,
        discountType: 'countdown',
        countdownDiscount: makeCountdown({
          startAt: new Date(now - HOUR_MS),
          endAt: new Date(now + HOUR_MS),
          initialPercent: 60,
          finalPercent: 20,
          mode: 'linear',
        }),
      };

      // прогرس ۰.۵ → 60 - 0.5×(60-20) = 40
      const result = calculateCoursePricing(course as any, new Date(now));

      expect(result.discountType).toBe('countdown');
      expect(result.currentDiscountPercent).toBeCloseTo(40, 5);
      expect(result.currentPrice).toBe(60000);
      expect(result.discountActive).toBe(true);
      expect(result.countdownProgress).toBeCloseTo(0.5, 5);
    });

    it('should calculate step discount in discrete steps', () => {
      const now = Date.now();
      const start = now - 90 * 60 * 1000; // ۹۰ دقیقه پیش
      const course = {
        price: 100000,
        isFree: false,
        discountType: 'countdown',
        countdownDiscount: makeCountdown({
          startAt: new Date(start),
          endAt: new Date(start + 120 * 60 * 1000), // کمپین ۱۲۰ دقیقه‌ای
          initialPercent: 40,
          finalPercent: 0,
          mode: 'step',
          stepPercent: 10,
          stepIntervalMinutes: 30,
        }),
      };

      // کل مدت ۱۲۰ دقیقه، گام ۳۰ دقیقه → ۴ گام؛ پیشرفت ۹۰/۱۲۰=۰.۷۵ → گام ۳
      // تخفیف = 40 - 3×10 = 10
      const result = calculateCoursePricing(course as any, new Date(now));

      expect(result.currentDiscountPercent).toBe(10);
      expect(result.currentPrice).toBe(90000);
    });

    it('should return 0% discount before campaign starts', () => {
      const now = Date.now();
      const percent = calculateCountdownPercent(
        makeCountdown({
          startAt: new Date(now + HOUR_MS),
          endAt: new Date(now + 2 * HOUR_MS),
          initialPercent: 70,
        }),
        new Date(now),
      );

      expect(percent).toBe(0);
    });

    it('should return finalPercent after campaign ends (expired countdown)', () => {
      const now = Date.now();
      const percent = calculateCountdownPercent(
        makeCountdown({
          startAt: new Date(now - 3 * HOUR_MS),
          endAt: new Date(now - HOUR_MS),
          initialPercent: 80,
          finalPercent: 15,
        }),
        new Date(now),
      );

      // بعد از پایان کمپین، درصد به مقدار نهایی ثابت می‌رسد (نه صفر)
      expect(percent).toBe(15);
    });

    it('should return 0% when countdown is disabled', () => {
      const percent = calculateCountdownPercent(
        makeCountdown({ enabled: false, initialPercent: 90 }),
        new Date(),
      );

      expect(percent).toBe(0);
    });

    it('should clamp discount between 0 and 100 regardless of progress', () => {
      const now = Date.now();
      // پیشرفت منفی/بیش از حد با clamp مدیریت می‌شود
      const before = calculateCountdownPercent(
        makeCountdown({
          startAt: new Date(now),
          endAt: new Date(now + HOUR_MS),
          initialPercent: 100,
          finalPercent: 0,
        }),
        new Date(now - HOUR_MS), // قبل از شروع
      );
      const after = calculateCountdownPercent(
        makeCountdown({
          startAt: new Date(now - 2 * HOUR_MS),
          endAt: new Date(now - HOUR_MS),
          initialPercent: 100,
          finalPercent: 0,
        }),
        new Date(now + 10 * HOUR_MS), // خیلی بعد از پایان
      );

      expect(before).toBe(0);
      expect(after).toBe(0); // finalPercent=0
    });

    it('should never produce a negative final price', () => {
      const result = calculateCoursePricing({
        price: 50000,
        isFree: false,
        discountType: 'countdown',
        countdownDiscount: makeCountdown({
          initialPercent: 100,
          finalPercent: 100, // تخفیف ۱۰۰٪ → قیمت صفر، نه منفی
        }),
      } as any, new Date(Date.now() - HOUR_MS));

      expect(result.currentPrice).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateCountdownDiscount', () => {
    it('should accept a valid configuration', () => {
      const errors = validateCountdownDiscount({
        enabled: true,
        startAt: new Date(Date.now() - HOUR_MS),
        endAt: new Date(Date.now() + HOUR_MS),
        initialPercent: 50,
        finalPercent: 10,
        mode: 'linear',
      });

      expect(errors).toHaveLength(0);
    });

    it('should reject initialPercent outside 0..100 (clamp rule)', () => {
      const errors = validateCountdownDiscount({
        enabled: true,
        startAt: new Date(Date.now() - HOUR_MS),
        endAt: new Date(Date.now() + HOUR_MS),
        initialPercent: 150,
        finalPercent: 10,
      });

      expect(errors.some((e) => e.field === 'initialPercent')).toBe(true);
    });

    it('should reject finalPercent greater than initialPercent', () => {
      const errors = validateCountdownDiscount({
        enabled: true,
        startAt: new Date(Date.now() - HOUR_MS),
        endAt: new Date(Date.now() + HOUR_MS),
        initialPercent: 20,
        finalPercent: 50,
      });

      expect(errors.some((e) => e.field === 'finalPercent')).toBe(true);
    });

    it('should reject endAt before startAt', () => {
      const errors = validateCountdownDiscount({
        enabled: true,
        startAt: new Date(Date.now() + HOUR_MS),
        endAt: new Date(Date.now() - HOUR_MS),
        initialPercent: 50,
        finalPercent: 10,
      });

      expect(errors.some((e) => e.field === 'endAt')).toBe(true);
    });

    it('should skip validation when disabled', () => {
      const errors = validateCountdownDiscount({ enabled: false });
      expect(errors).toHaveLength(0);
    });
  });
});
