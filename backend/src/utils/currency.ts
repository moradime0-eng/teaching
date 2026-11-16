/**
 * 💱 قرارداد واحد پول سیستم مالی — Homayoon
 *
 * ## قرارداد داخلی (ثابت و مستندشده)
 * تمام مبالغ ذخیره‌شده در دیتابیس و محاسبات داخلی به واحد **تومان** هستند:
 *   - Course.price، Payment.finalAmount/totalAmount/discountAmount
 *   - Wallet.balance/totalDeposited/totalWithdrawn/totalSpent
 *   - WalletTransaction.amount، Enrollment.pricePaid
 *   - پیام‌ها/برچسب‌های UI: «تومان»
 *
 * ## قرارداد درگاه‌ها (در مرز adapter تبدیل می‌شود)
 *   - NikPal: **ریال** (IRR) — اثبات‌شده از کد خودِ NikPal:
 *       settings.model.ts defaultCurrency='IRR'، sandbox.controller «ریال»،
 *       payment.service اعلان «ریال»، مستندات API بدون تبدیل واحد.
 *   - Zarinpal: ریال (طبق مستندات رسمی) — کد فعلی پروژه مرده است؛
 *       تبدیل در صورت فعال‌سازی باید در adapter خودِ آن انجام شود.
 *
 * ## قاعده طلایی
 * تبدیل واحد **فقط یک بار** و **فقط در مرز درگاه** (adapter) انجام می‌شود —
 * نه در کنترلر، نه در فرانت‌اند، نه در callback/verify/کیف پول/گزارش‌ها.
 * مبلغ داخلی سفارش (`finalAmount` = تومان) هرگز با مبلغ ارسالی به درگاه
 * (`amountRial` = ریال) جابه‌جا نمی‌شود.
 */

/** نسبت تبدیل: ۱ تومان = ۱۰ ریال */
export const RIAL_PER_TOMAN = 10;

/**
 * تبدیل تومان به ریال (مرز درگاه‌های ریالی مثل NikPal).
 *
 * مبلغ تومانی باید عدد صحیح غیرمنفی باشد؛ خروجی همیشه صحیح است
 * (ریال هیچ‌گاه کسری ندارد چون ×۱۰ روی صحیح، صحیح می‌ماند).
 *
 * @throws RangeError اگر مبلغ غیرعددی/منفی/غیرصحیح باشد
 */
export function tomanToRial(amountToman: number): number {
  if (!Number.isInteger(amountToman)) {
    throw new RangeError(`مبلغ تومانی باید عدد صحیح باشد: ${amountToman}`);
  }
  if (amountToman < 0) {
    throw new RangeError(`مبلغ تومانی نمی‌تواند منفی باشد: ${amountToman}`);
  }
  return amountToman * RIAL_PER_TOMAN;
}

/**
 * تبدیل ریال به تومان (فقط برای مقایسه/اعتبارسنجی مبالغ برگشتی درگاه).
 * تقسیم بر ۱۰ روی صحیح، صحیح است؛ اگر ریالِ درگاه مضرب ۱۰ نباشد
 * (داده خراب/دستکاری‌شده) عدد اعشاری برمی‌گردد تا فراخواننده متوجه شود.
 */
export function rialToToman(amountRial: number): number {
  if (!Number.isFinite(amountRial) || amountRial < 0) {
    throw new RangeError(`مبلغ ریالی نامعتبر است: ${amountRial}`);
  }
  return amountRial / RIAL_PER_TOMAN;
}

/**
 * آیا مبلغ ریالیِ درگاه با مبلغ تومانیِ سفارش مطابقت دارد؟
 * (اعتبارسنجی H5 در verify — بدون تبدیل دوباره در لایه‌های دیگر)
 */
export function rialMatchesToman(amountRial: number, amountToman: number): boolean {
  if (!Number.isFinite(amountRial) || !Number.isInteger(amountToman)) return false;
  return amountRial === amountToman * RIAL_PER_TOMAN;
}