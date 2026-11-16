/**
 * ⚙️ پیکربندی درگاه پرداخت زرین‌پال
 *
 * شامل: اعتبارسنجی env vars، URL‌های API، و فعال/غیرفعال بودن سرویس
 */

// ==================== Environment Variables ====================
const ZARINPAL_MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID || '';
const ZARINPAL_SANDBOX = process.env.ZARINPAL_SANDBOX === 'true';
const ZARINPAL_CURRENCY = (process.env.ZARINPAL_CURRENCY as 'IRT' | 'IRR') || 'IRT';

const FRONTEND_PAYMENT_SUCCESS_URL =
  process.env.FRONTEND_PAYMENT_SUCCESS_URL || 'http://localhost:4200/payment/success';
const FRONTEND_PAYMENT_FAILURE_URL =
  process.env.FRONTEND_PAYMENT_FAILURE_URL || 'http://localhost:4200/payment/failure';
const FRONTEND_PAYMENT_CALLBACK_URL =
  process.env.FRONTEND_PAYMENT_CALLBACK_URL || 'http://localhost:5000/api/v1/payments/callback';

// ==================== API Endpoints ====================
const ZARINPAL_API_BASE = ZARINPAL_SANDBOX
  ? 'https://sandbox.zarinpal.com/pg/v4/payment'
  : 'https://payment.zarinpal.com/pg/v4/payment';

export const ZARINPAL_ENDPOINTS = {
  request: `${ZARINPAL_API_BASE}/request.json`,
  verify: `${ZARINPAL_API_BASE}/verify.json`,
  inquiry: `${ZARINPAL_API_BASE}/inquiry.json`,
  reverse: `${ZARINPAL_API_BASE}/reverse.json`,
  feeCalculation: `${ZARINPAL_API_BASE}/feeCalculation.json`,
  startPay: ZARINPAL_SANDBOX
    ? 'https://sandbox.zarinpal.com/pg/StartPay'
    : 'https://payment.zarinpal.com/pg/StartPay',
} as const;

// ==================== Graceful Degradation ====================
/**
 * اگر متغیرهای محیطی زرین‌پال تنظیم نشده باشند، سرویس پرداخت غیرفعال می‌شود
 * و اپلیکیشن crash نمی‌کند.
 */
export const isPaymentEnabled = Boolean(ZARINPAL_MERCHANT_ID);

if (!isPaymentEnabled) {
  console.warn(
    '⚠️  [ZARINPAL] سرویس پرداخت غیرفعال است. متغیر ZARINPAL_MERCHANT_ID تنظیم نشده است.',
  );
}

// ==================== Export Config ====================
export const zarinpalConfig = {
  merchantId: ZARINPAL_MERCHANT_ID,
  sandbox: ZARINPAL_SANDBOX,
  currency: ZARINPAL_CURRENCY,
  isPaymentEnabled,
  frontendSuccessUrl: FRONTEND_PAYMENT_SUCCESS_URL,
  frontendFailureUrl: FRONTEND_PAYMENT_FAILURE_URL,
  frontendCallbackUrl: FRONTEND_PAYMENT_CALLBACK_URL,
  endpoints: ZARINPAL_ENDPOINTS,
} as const;

export default zarinpalConfig;
