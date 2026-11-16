/**
 * 🔌 سرویس ارتباط با API درگاه NikPal
 *
 * شامل: createPayment، verifyPayment، getPaymentStatus
 * با retry logic، exponential backoff، timeout و Graceful Degradation
 *
 * الگوی retry/timeout از zarinpal.service.ts الگوبرداری شده است.
 */

import { nikpalConfig } from '../config/nikpal';
import { tomanToRial } from '../utils/currency';

// ==================== Types ====================

export interface NikpalCreatePaymentResponse {
  paymentId: string;
  orderId: string;
  paymentUrl: string;
}

export interface NikpalVerifyPaymentResponse {
  paymentId: string;
  orderId: string;
  status: string; // PAID | FAILED
  amount: number;
  referenceId?: string;
}

export interface NikpalPaymentStatusResponse {
  paymentId: string;
  orderId: string;
  amount: number;
  status: string; // PAID | FAILED | ...
  referenceId?: string;
  createdAt: string;
  paidAt?: string;
}

interface NikpalEnvelope<T> {
  success: boolean;
  data?: T;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
  /** NikPal error codes are documented under `errors.code` */
  errors?: { code?: string; message?: string };
}

// ==================== Custom Error Class ====================
export class NikpalError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
  ) {
    super(message);
    this.name = 'NikpalError';
  }
}

// ==================== Constants ====================
const MAX_NETWORK_RETRIES = nikpalConfig.maxRetries; // 2
const NETWORK_RETRY_DELAY_MS = 2000;

const NETWORK_ERROR_CODES = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
];

// ==================== Retry Logic ====================

/** بررسی اینکه آیا خطای شبکه است یا نه */
function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code && NETWORK_ERROR_CODES.includes(code)) return true;
    if (error.name === 'AbortError') return true; // timeout
    if (error.message?.includes('fetch failed')) return true;
  }
  return false;
}

/** خطای سرور (5xx) → retry دارد */
function isServerError(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

/** خطای کلاینت (4xx) → بدون retry */
function isClientError(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * استخراج پیام ریشه‌ای خطای شبکه از زنجیره error.cause
 *
 * fetch سطح بالای Node فقط «fetch failed» می‌دهد؛ علت واقعی
 * (مثل getaddrinfo ENOTFOUND) در `error.cause` پنهان می‌ماند.
 */
function describeNetworkCause(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as NodeJS.ErrnoException).code;
    if (code) {
      parts.push(code);
    } else if (current.message && current.message !== 'fetch failed') {
      parts.push(current.message);
    }
    current = (current as { cause?: unknown }).cause;
  }
  return parts.length > 0 ? parts.join(' ← ') : 'خطای ناشناخته شبکه';
}

/** استخراج پیام/کد خطا از بدنه پاسخ NikPal */
function extractError(
  response: NikpalEnvelope<unknown> | null,
  httpStatus: number,
): {
  message: string;
  code?: string;
} {
  if (response) {
    const message = response.message || response.error?.message || response.errors?.message;
    const code = response.code || response.error?.code || response.errors?.code;
    if (message || code) {
      return { message: message || `خطای درگاه پرداخت (کد: ${code})`, code };
    }
  }
  return { message: `خطای سرور پرداخت (${httpStatus})` };
}

/**
 * ارسال درخواست به NikPal با retry logic
 */
async function nikpalRequest<T>(
  path: string,
  options: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
): Promise<NikpalEnvelope<T>> {
  if (!nikpalConfig.isPaymentEnabled) {
    throw new NikpalError('سرویس پرداخت غیرفعال است', 503, 'PAYMENT_DISABLED');
  }

  const endpoint = `${nikpalConfig.baseUrl}${path}`;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), nikpalConfig.timeout); // 15s

      const response = await fetch(endpoint, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${nikpalConfig.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const httpStatus = response.status;
      let payload: NikpalEnvelope<T> | null = null;
      try {
        payload = (await response.json()) as NikpalEnvelope<T>;
      } catch {
        payload = null;
      }

      // 2xx ولی success !== true → خطای NikPal (بدون retry)
      if (response.ok && payload && payload.success === true) {
        return payload;
      }

      // خطای کلاینت (4xx) → بدون retry پرتاب کن
      if (isClientError(httpStatus)) {
        const { message, code } = extractError(payload, httpStatus);
        throw new NikpalError(message, httpStatus, code);
      }

      // خطای سرور (5xx) → retry
      if (isServerError(httpStatus) && attempt < MAX_NETWORK_RETRIES) {
        const delay = NETWORK_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[PAYMENT] NikPal server error ${httpStatus}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES})`,
        );
        await sleep(delay);
        lastError = new NikpalError(`خطای سرور پرداخت (${httpStatus})`, httpStatus);
        continue;
      }

      // 2xx بدون success:true یا 5xx بدون retry باقی‌مانده
      const { message, code } = extractError(payload, httpStatus);
      throw new NikpalError(message, httpStatus || 500, code);
    } catch (error) {
      lastError = error;

      // خطای NikPal (не retry)
      if (error instanceof NikpalError) {
        // فقط خطاهای سروری را یک بار دیگر امتحان کن
        if (isServerError(error.statusCode) && attempt < MAX_NETWORK_RETRIES) {
          const delay = NETWORK_RETRY_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
        throw error;
      }

      // خطای شبکه → retry با backoff
      if (isNetworkError(error) && attempt < MAX_NETWORK_RETRIES) {
        const delay = NETWORK_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[PAYMENT] NikPal network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_NETWORK_RETRIES + 1}): ${describeNetworkCause(error)}`,
        );
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  if (lastError instanceof NikpalError) {
    throw lastError;
  }
  throw new NikpalError(
    `خطای ارتباط با درگاه پرداخت: ${describeNetworkCause(lastError)}`,
    500,
    'NETWORK_ERROR',
  );
}

// ==================== NikPal API Methods ====================

class NikpalService {
  /**
   * 🔹 ایجاد پرداخت (Create Payment)
   * POST /api/v1/payments
   *
   * 💱 قرارداد واحد پول (مرز درگاه):
   *  - ورودی: `amountToman` — واحد داخلی سیستم (تومان).
   *  - خروجی به درگاه: `amount` به **ریال** (قرارداد NikPal = IRR).
   *  - تبدیل `tomanToRial` **فقط همین‌جا** انجام می‌شود؛ هیچ فراخواننده‌ای
   *    نباید مبلغ را از قبل تبدیل کند (ضد تبدیل دوباره / double conversion).
   */
  async createPayment(params: {
    amountToman: number;
    orderId: string;
    callbackUrl: string;
  }): Promise<NikpalCreatePaymentResponse> {
    // مرز تبدیل واحد: تومان (داخلی) ← ریال (NikPal)
    const amountRial = tomanToRial(params.amountToman);
    const response = await nikpalRequest<NikpalCreatePaymentResponse>('/api/v1/payments', {
      method: 'POST',
      body: {
        amount: amountRial,
        orderId: params.orderId,
        callbackUrl: params.callbackUrl,
        // ⚠️ FIX: وقتی NIKPAL_SANDBOX=true باشد، درخواست را صراحتاً آزمایشی می‌فرستیم
        // تا NikPal روی درگاه dummy (سندباکس) انجام شود و به بانک واقعی وصل نشود.
        // بدون این فیلد، NikPal درگاه production پیش‌فرض را انتخاب می‌کند و خطای
        // بانک (مثل 421 ملت) مستقیم به کاربر برمی‌گردد.
        sandbox: nikpalConfig.isSandbox,
      },
    });

    const data = response.data;
    if (!data || !data.paymentId || !data.paymentUrl) {
      throw new NikpalError('پاسخ نامعتبر از درگاه پرداخت', 502, 'INVALID_RESPONSE');
    }

    return {
      paymentId: data.paymentId,
      orderId: data.orderId,
      paymentUrl: data.paymentUrl,
    };
  }

  /**
   * 🔹 تأیید نهایی پرداخت (Verify)
   * POST /api/v1/payments/:paymentId/verify
   */
  async verifyPayment(paymentId: string): Promise<NikpalVerifyPaymentResponse> {
    const response = await nikpalRequest<NikpalVerifyPaymentResponse>(
      `/api/v1/payments/${encodeURIComponent(paymentId)}/verify`,
      { method: 'POST' },
    );

    const data = response.data;
    if (!data) {
      throw new NikpalError('پاسخ نامعتبر از درگاه پرداخت', 502, 'INVALID_RESPONSE');
    }

    return {
      paymentId: data.paymentId,
      orderId: data.orderId,
      status: data.status,
      amount: data.amount,
      referenceId: data.referenceId,
    };
  }

  /**
   * 🔹 استعلام وضعیت پرداخت (Status)
   * GET /api/v1/payments/:paymentId
   */
  async getPaymentStatus(paymentId: string): Promise<NikpalPaymentStatusResponse> {
    const response = await nikpalRequest<NikpalPaymentStatusResponse>(
      `/api/v1/payments/${encodeURIComponent(paymentId)}`,
      { method: 'GET' },
    );

    const data = response.data;
    if (!data) {
      throw new NikpalError('پاسخ نامعتبر از درگاه پرداخت', 502, 'INVALID_RESPONSE');
    }

    return data;
  }

  /**
   * 🔹 Helper: ساخت URL پرداخت کاربر
   */
  getPaymentUrl(paymentId: string): string {
    return `${nikpalConfig.baseUrl}/api/v1/payments/${paymentId}/redirect`;
  }
}

export const nikpalService = new NikpalService();
export default nikpalService;
