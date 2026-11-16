/**
 * 🎫 سرویس اعتبارسنجی دامنه‌ی کوپن (Coupon Scope)
 *
 * فیلدهای دامنه‌ی کوپن که پیش‌ز این «هیچ‌جا» اعمال نمی‌شدند (باگ M1):
 *  - applicableCourses     → فقط دوره‌های مشخص‌شده
 *  - applicableCategories  → فقط دسته‌بندی‌های مشخص‌شده
 *  - excludedCourses       → دوره‌های مستثنی
 *  - isFirstPurchaseOnly   → فقط اولین خرید
 *
 * آرایه‌های خالی = بدون محدودیت (سازگاری عقب‌رو با کوپن‌های قدیمی).
 *
 * ⚠️ انحراف عمدی از الگوی some(): برای «دوره‌های مجاز» و «دسته‌های مجاز»
 * از every() استفاده می‌شود. با some()، سبد چندآیتمه‌ای که فقط یک قلمش در
 * دامنه باشد، «کل» تخفیف روی کل سبد می‌گرفت (کوپن برای قلمِ خارج از دامنه
 * هم اعمال می‌شد و پلتفرم از جیب تخفیف می‌داد — دقیقاً همان نوع باگِ مالیِ
 * پرامپت ۳). برای excludedCourses همچنان some() (کافی است یک قلم مستثنی باشد).
 */

import Coupon from '../models/Coupon';
import Payment from '../models/Payment';
import { PaymentStatus } from '../types';

export interface CouponScopeResult {
  valid: boolean;
  reason?: string;
}

export async function validateCouponScope(
  coupon: any,
  courseIds: string[],
  categoryIds: string[],
  userId: string,
): Promise<CouponScopeResult> {
  // ─── ۱. دوره‌های مجاز: همه‌ی دوره‌های سبد باید در دامنه باشند ───
  if (coupon.applicableCourses?.length > 0) {
    const allowed: string[] = coupon.applicableCourses.map(String);
    const allInScope = courseIds.every((id) => allowed.includes(id));
    if (!allInScope) {
      return { valid: false, reason: 'کوپن برای دوره‌های انتخابی قابل استفاده نیست' };
    }
  }

  // ─── ۲. دسته‌بندی‌های مجاز: همه‌ی دسته‌های سبد باید در دامنه باشند ───
  if (coupon.applicableCategories?.length > 0) {
    const allowed: string[] = coupon.applicableCategories.map(String);
    const allInScope = categoryIds.every((id) => allowed.includes(id));
    if (!allInScope) {
      return { valid: false, reason: 'کوپن برای دسته‌بندی دوره‌های شما فعال نیست' };
    }
  }

  // ─── ۳. دوره‌های مستثنی: کافی است یکی از اقلام سبد مستثنی باشد ───
  if (coupon.excludedCourses?.length > 0) {
    const excluded: string[] = coupon.excludedCourses.map(String);
    const hasExcluded = courseIds.some((id) => excluded.includes(id));
    if (hasExcluded) {
      return { valid: false, reason: 'برخی دوره‌های سبد از تخفیف مستثنی هستند' };
    }
  }

  // ─── ۴. فقط اولین خرید: هیچ خرید دوره‌ی موفق قبلی نباید باشد ───
  // paymentMethod: رایگان (free) و شارژ کیف پول (wallet-topup) «خرید دوره» نیستند؛
  // پرداخت‌های بازپرداخت‌شده هم status='refunded' دارند و اینجا نمی‌آیند.
  if (coupon.isFirstPurchaseOnly) {
    const previousPurchase = await Payment.findOne({
      user: userId,
      status: PaymentStatus.SUCCESS,
      paymentMethod: { $nin: ['free', 'wallet-topup'] },
    }).select('_id');
    if (previousPurchase) {
      return { valid: false, reason: 'این کوپن فقط برای اولین خرید است' };
    }
  }

  return { valid: true };
}

export default validateCouponScope;
