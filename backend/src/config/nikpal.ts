import dotenv from 'dotenv';
dotenv.config();

/** آدرس پایه سرور توسعه NikPal (NIKPAL_SANDBOX=true) */
const SANDBOX_BASE_URL = 'http://localhost:3000';

/**
 * آدرس پایه API پرداخت NikPal (Production)
 *
 * ⚠️ توجه: زیردامنه api.nikpal.ir در DNS وجود ندارد (حتی روی NSهای رسمی ArvanCloud)
 * و درخواست‌ها با خطای ENOTFOUND / fetch failed شکست می‌خورند.
 * API واقعی روی دامنه اصلی https://nikpal.ir سرو می‌شود.
 * در صورت راه‌اندازی زیردامنه اختصاصی، فقط NIKPAL_BASE_URL را در .env تنظیم کنید.
 */
const PRODUCTION_BASE_URL = process.env.NIKPAL_BASE_URL || 'https://nikpal.ir';

/**
 * ⚙️ پیکربندی درگاه پرداخت NikPal
 *
 * - NIKPAL_API_KEY: کلید API پذیرنده (بدون آن پرداخت غیرفعال می‌شود)
 * - NIKPAL_BASE_URL: آدرس پایه API در Production (پیش‌فرض: https://nikpal.ir)
 * - NIKPAL_SANDBOX: در حالت 'true' از سرور توسعه (localhost:3000) استفاده می‌شود
 * - NIKPAL_CALLBACK_URL: آدرس بازگشت درگاه به بک‌اند (GET /api/v1/payments/callback)
 * - FRONTEND_PAYMENT_*: آدرس‌های بازگشت فرانت‌اند پس از پرداخت موفق/ناموفق
 */
export const nikpalConfig = {
  apiKey: process.env.NIKPAL_API_KEY || '',
  baseUrl: (
    process.env.NIKPAL_SANDBOX === 'true' ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL
  ).replace(/\/+$/, ''),
  callbackUrl:
    process.env.NIKPAL_CALLBACK_URL ||
    `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/v1/payments/callback`,
  frontendSuccessUrl:
    process.env.FRONTEND_PAYMENT_SUCCESS_URL || 'http://localhost:4200/payment/success',
  frontendFailureUrl:
    process.env.FRONTEND_PAYMENT_FAILURE_URL || 'http://localhost:4200/payment/failure',
  isPaymentEnabled: !!process.env.NIKPAL_API_KEY,
  /** حالت آزمایشی: پرداخت‌ها به جای درگاه واقعی، روی سندباکس NikPal انجام می‌شوند */
  isSandbox: process.env.NIKPAL_SANDBOX === 'true',
  timeout: 15000,
  maxRetries: 2,
};

export default nikpalConfig;
