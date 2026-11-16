/**
 * 🔌 سرویس ارتباط با API زرین‌پال
 *
 * شامل: request، verify، inquiry، reverse، feeCalculation
 * با retry logic، exponential backoff، و Graceful Degradation
 */

import { zarinpalConfig, ZARINPAL_ENDPOINTS } from '../config/zarinpal';

// ==================== Types ====================
interface ZarinPalBaseResponse {
  data: Record<string, unknown> | null;
  errors: Record<string, number>;
}

export interface ZarinPalRequestResponse {
  data: {
    code: number;
    message: string;
    authority: string;
    fee: number;
    fee_type: string;
  };
  errors: Record<string, number>;
}

export interface ZarinPalVerifyResponse {
  data: {
    code: number;
    message: string;
    card_hash: string;
    card_pan: string;
    ref_id: number;
    fee_type: string;
    fee: number;
    shaparak_track_id?: string;
  };
  errors: Record<string, number>;
}

export interface ZarinPalInquiryResponse {
  data: {
    code: number;
    message: string;
    card_hash: string;
    card_pan: string;
    ref_id: number;
    amount: number;
    status: string;
  };
  errors: Record<string, number>;
}

export interface ZarinPalReverseResponse {
  data: {
    code: number;
    message: string;
    card_hash: string;
    card_pan: string;
    ref_id: number;
  };
  errors: Record<string, number>;
}

export interface ZarinPalFeeResponse {
  data: {
    fee: number;
    fee_type: string;
  };
  errors: Record<string, number>;
}

export interface ZarinPalRequestParams {
  amount: number;
  description: string;
  callback_url: string;
  metadata?: {
    email?: string;
    mobile?: string;
    order_id?: string;
  };
}

// ==================== Constants ====================
const MAX_NETWORK_RETRIES = 2;
const MAX_SERVER_RETRIES = 1;
const NETWORK_RETRY_DELAY_MS = 2000;
const SERVER_RETRY_DELAY_MS = 3000;

const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
];

// ==================== Retry Logic ====================
/**
 * بررسی اینکه آیا خطای شبکه است یا نه
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && NETWORK_ERROR_CODES.includes(code)) return true;
    if (error.name === 'AbortError') return true; // timeout
    if (error.message?.includes('fetch failed')) return true;
  }
  return false;
}

/**
 * بررسی اینکه آیا خطای سرور زرین‌پال (5xx) است یا نه
 */
function isServerError(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

/**
 * بررسی اینکه آیا خطای کلاینت (4xx) است یا نه
 */
function isClientError(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

/**
 * انتظار به مدت مشخص
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ارسال درخواست به زرین‌پال با retry logic
 */
async function zarinpalRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!zarinpalConfig.isPaymentEnabled) {
    throw new ZarinPalError('سرویس پرداخت غیرفعال است', -100);
  }

  let lastError: unknown;

  // Retry 1: خطاهای شبکه (حداکثر 2 بار با exponential backoff: 2s, 4s)
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry 2: خطاهای سرور زرین‌پال (1 بار بعد از 3 ثانیه)
      if (isServerError(response.status)) {
        if (attempt < MAX_NETWORK_RETRIES) {
          const delay = NETWORK_RETRY_DELAY_MS * Math.pow(2, attempt);
          console.warn(
            `[PAYMENT] ZarinPal server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES})`,
          );
          await sleep(delay);
          continue;
        }
      }

      // خطاهای کلاینت (4xx) → retry نکن
      if (isClientError(response.status)) {
        const errorBody = await response.json().catch(() => ({}));
        throw new ZarinPalError(
          `خطای سرور پرداخت (${response.status})`,
          response.status,
          errorBody,
        );
      }

      const result = (await response.json()) as T;
      return result;
    } catch (error) {
      lastError = error;

      // اگر خطای زرین‌پال بود، throw کن (не retry)
      if (error instanceof ZarinPalError) {
        throw error;
      }

      // اگر خطای شبکه است و retry باقی مانده
      if (isNetworkError(error) && attempt < MAX_NETWORK_RETRIES) {
        const delay = NETWORK_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[PAYMENT] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES + 1}):`,
          error instanceof Error ? error.message : String(error),
        );
        await sleep(delay);
        continue;
      }

      // اگر retry تمام شده یا خطای دیگری است
      break;
    }
  }

  // اگر به اینجا رسیدیم، تمام retryها ناموفق بوده
  if (lastError instanceof ZarinPalError) {
    throw lastError;
  }
  throw new ZarinPalError(
    `خطای ارتباط با درگاه پرداخت: ${lastError instanceof Error ? lastError.message : 'خطای ناشناخته'}`,
    -99,
  );
}

// ==================== Custom Error Class ====================
export class ZarinPalError extends Error {
  public code: number;
  public rawResponse?: unknown;

  constructor(message: string, code: number, rawResponse?: unknown) {
    super(message);
    this.name = 'ZarinPalError';
    this.code = code;
    this.rawResponse = rawResponse;
  }
}

// ==================== ZarinPal API Methods ====================

/**
 * 🔹 درخواست پرداخت (Request)
 * ایجاد تراکنش جدید و دریافت authority
 */
export async function requestPayment(params: ZarinPalRequestParams): Promise<{
  authority: string;
  fee: number;
  feeType: string;
  code: number;
  message: string;
}> {
  const body: Record<string, unknown> = {
    merchant_id: zarinpalConfig.merchantId,
    amount: params.amount,
    currency: zarinpalConfig.currency,
    description: params.description,
    callback_url: params.callback_url,
  };

  if (params.metadata) {
    body.metadata = params.metadata;
  }

  const response = await zarinpalRequest<ZarinPalRequestResponse>(
    ZARINPAL_ENDPOINTS.request,
    body,
  );

  // بررسی کد پاسخ
  // 100 = درخواست موفق
  if (response.data.code !== 100) {
    const errorMsg = getZarinPalErrorMessage(response.data.code);
    throw new ZarinPalError(errorMsg, response.data.code, response);
  }

  return {
    authority: response.data.authority,
    fee: response.data.fee,
    feeType: response.data.fee_type,
    code: response.data.code,
    message: response.data.message,
  };
}

/**
 * 🔹 تأیید پرداخت (Verify)
 * تأیید تراکنش با مبلغ ذخیره‌شده در Payment
 */
export async function verifyPayment(params: {
  authority: string;
  amount: number;
}): Promise<{
  refId: number;
  cardPan: string;
  cardHash: string;
  fee: number;
  feeType: string;
  code: number;
  message: string;
}> {
  const body = {
    merchant_id: zarinpalConfig.merchantId,
    authority: params.authority,
    amount: params.amount,
  };

  const response = await zarinpalRequest<ZarinPalVerifyResponse>(
    ZARINPAL_ENDPOINTS.verify,
    body,
  );

  // 100 = موفق، 101 = قبلاً تأیید شده
  if (response.data.code !== 100 && response.data.code !== 101) {
    const errorMsg = getZarinPalErrorMessage(response.data.code);
    throw new ZarinPalError(errorMsg, response.data.code, response);
  }

  return {
    refId: response.data.ref_id,
    cardPan: response.data.card_pan,
    cardHash: response.data.card_hash,
    fee: response.data.fee,
    feeType: response.data.fee_type,
    code: response.data.code,
    message: response.data.message,
  };
}

/**
 * 🔹 استعلام تراکنش (Inquiry)
 * بررسی وضعیت تراکنش برای reconciliation
 */
export async function inquirePayment(
  authority: string,
): Promise<{
  code: number;
  message: string;
  status: string;
  amount: number;
  refId: number;
  cardPan: string;
  cardHash: string;
}> {
  const body = {
    merchant_id: zarinpalConfig.merchantId,
    authority,
  };

  const response = await zarinpalRequest<ZarinPalInquiryResponse>(
    ZARINPAL_ENDPOINTS.inquiry,
    body,
  );

  return {
    code: response.data.code,
    message: response.data.message,
    status: response.data.status,
    amount: response.data.amount,
    refId: response.data.ref_id,
    cardPan: response.data.card_pan,
    cardHash: response.data.card_hash,
  };
}

/**
 * 🔹 برگشت تراکنش (Reverse/Refund)
 * برگشت وجه پرداخت شده
 */
export async function reversePayment(authority: string): Promise<{
  code: number;
  message: string;
  refId: number;
  cardPan: string;
  cardHash: string;
}> {
  const body = {
    merchant_id: zarinpalConfig.merchantId,
    authority,
  };

  const response = await zarinpalRequest<ZarinPalReverseResponse>(
    ZARINPAL_ENDPOINTS.reverse,
    body,
  );

  if (response.data.code !== 100) {
    const errorMsg = getZarinPalErrorMessage(response.data.code);
    throw new ZarinPalError(errorMsg, response.data.code, response);
  }

  return {
    code: response.data.code,
    message: response.data.message,
    refId: response.data.ref_id,
    cardPan: response.data.card_pan,
    cardHash: response.data.card_hash,
  };
}

/**
 * 🔹 محاسبه کارمزد (Fee Calculation)
 */
export async function calculateFee(amount: number): Promise<{
  fee: number;
  feeType: string;
}> {
  const body = {
    merchant_id: zarinpalConfig.merchantId,
    amount,
  };

  const response = await zarinpalRequest<ZarinPalFeeResponse>(
    ZARINPAL_ENDPOINTS.feeCalculation,
    body,
  );

  return {
    fee: response.data.fee,
    feeType: response.data.fee_type,
  };
}

// ==================== Helpers ====================

/**
 * دریافت URL پرداخت از authority
 */
export function getPaymentUrl(authority: string): string {
  return `${ZARINPAL_ENDPOINTS.startPay}/${authority}`;
}

/**
 * تبدیل کد خطا به پیام فارسی
 */
export function getZarinPalErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    [-1]: 'اطلاعات ارسالی ناقص است',
    [-2]: 'مبلغ پرداختی کمتر از حد مجاز است',
    [-3]: 'تعریف تراکنش انجام نشده',
    [-4]: 'سطوح دسترسی شما به این تراکنش غیرمجاز است',
    [-5]: 'مبلغ پرداختی بیش از حد مجاز است',
    [-6]: 'درخواست معتبر نیست',
    [-7]: '封锁 شده',
    [-10]: 'Merchant ID نامعتبر است',
    [-11]: 'Merchant غیرفعال است',
    [-12]: 'تلاش شما از حد مجاز بیشتر شده است',
    [-13]: 'اطلاعات هویتی شما ناقص است',
    [-14]: 'IP نامعتبر است',
    [-15]: 'درگاه پرداخت فعال نیست',
    [-16]: ' سطح تأیید هویت شما پایین است',
    [-17]: 'عملیات انجام نشد',
    [-18]: 'آدرس وب سرویس نامعتبر است',
    [-19]: 'مبلغ پرداختی با تراکنش مطابقت ندارد',
    [-20]: 'اقلام سبد خرید نامعتبر است',
    [-21]: 'مرچنت‌کد نامعتبر است',
    ['-50']: 'مبلغ با تأییدیه مطابقت ندارد',
    ['-51']: 'پرداخت ناموفق بود',
    ['-52']: 'خطای غیرمنتظره رخ داد',
    ['-53']: 'تراکنش مورد نظر یافت نشد',
    '-54': 'مرچنت‌کد نامعتبر است',
    '-55': 'درخواست تأیید نامعتبر است',
    '100': 'عملیات پرداخت با موفقیت انجام شد',
    '101': 'تراکنش قبلاً تأیید شده است',
  };

  return messages[code] || `خطای ناشناخته (کد: ${code})`;
}

export default {
  requestPayment,
  verifyPayment,
  inquirePayment,
  reversePayment,
  calculateFee,
  getPaymentUrl,
  getZarinPalErrorMessage,
  ZarinPalError,
};
