/// <reference types="jest" />
/**
 * 💱 تست‌های واحد قرارداد واحد پول (تومان ↔ ریال)
 *
 * قرارداد داخلی: تمام مبالغ به تومان.
 * قرارداد NikPal: مبلغ ارسالی به درگاه به ریال (IRR).
 * تبدیل فقط یک بار و فقط در مرز adapter انجام می‌شود.
 *
 * بدون DB — توابع خالص.
 */
import {
  RIAL_PER_TOMAN,
  tomanToRial,
  rialToToman,
  rialMatchesToman,
} from '../utils/currency';

// کانفیگ درگاه برای تست adapter واقعی (بدون env واقعی)
jest.mock('../config/nikpal', () => {
  const config = {
    apiKey: 'test-api-key',
    baseUrl: 'http://localhost:3000',
    callbackUrl: 'http://localhost:5000/api/v1/payments/callback',
    frontendSuccessUrl: 'http://localhost:4200/payment/success',
    frontendFailureUrl: 'http://localhost:4200/payment/failure',
    isPaymentEnabled: true,
    isSandbox: true,
    timeout: 15000,
    maxRetries: 2,
  };
  return { nikpalConfig: config, default: config };
});

import { nikpalService } from '../services/nikpal.service';

describe('Currency Contract (toman ↔ rial)', () => {
  describe('tomanToRial — تبدیل در مرز درگاه', () => {
    it('should convert 10,000 toman to 100,000 rial (نمونه گزارش‌شده)', () => {
      expect(tomanToRial(10000)).toBe(100000);
    });

    it('should convert 1,000,000 toman to 10,000,000 rial', () => {
      expect(tomanToRial(1000000)).toBe(10000000);
    });

    it('should convert 0 toman to 0 rial', () => {
      expect(tomanToRial(0)).toBe(0);
    });

    it('should keep integer output for odd toman amounts (×10)', () => {
      expect(tomanToRial(12345)).toBe(123450);
      expect(Number.isInteger(tomanToRial(12345))).toBe(true);
    });

    it('should reject negative amounts', () => {
      expect(() => tomanToRial(-1)).toThrow(RangeError);
    });

    it('should reject non-integer amounts (no silent rounding)', () => {
      expect(() => tomanToRial(1000.5)).toThrow(RangeError);
      expect(() => tomanToRial(NaN)).toThrow(RangeError);
      expect(() => tomanToRial(Infinity)).toThrow(RangeError);
    });
  });

  describe('rialToToman — فقط برای اعتبارسنجی مبالغ برگشتی درگاه', () => {
    it('should convert 100,000 rial back to 10,000 toman', () => {
      expect(rialToToman(100000)).toBe(10000);
    });

    it('should reject invalid rial values', () => {
      expect(() => rialToToman(-10)).toThrow(RangeError);
      expect(() => rialToToman(NaN)).toThrow(RangeError);
    });
  });

  describe('rialMatchesToman — اعتبارسنجی H5 در verify', () => {
    it('should match when gateway returns exactly toman×10', () => {
      expect(rialMatchesToman(100000, 10000)).toBe(true);
      expect(rialMatchesToman(300000, 30000)).toBe(true);
      expect(rialMatchesToman(0, 0)).toBe(true);
    });

    it('should NOT match when gateway returns toman value unchanged (باگ اصلی)', () => {
      // ۱۰,۰۰۰ تومان بدون تبدیل = ۱۰,۰۰۰ ریال → نباید پذیرفته شود
      expect(rialMatchesToman(10000, 10000)).toBe(false);
    });

    it('should NOT match tampered or fractional values', () => {
      expect(rialMatchesToman(999, 30000)).toBe(false);
      expect(rialMatchesToman(100005, 10000)).toBe(false);
      expect(rialMatchesToman(NaN, 10000)).toBe(false);
      expect(rialMatchesToman(100000, 10000.5)).toBe(false);
    });
  });

  it('RIAL_PER_TOMAN must stay 10 (قرارداد NikPal = IRR)', () => {
    expect(RIAL_PER_TOMAN).toBe(10);
  });
});

describe('NikPal adapter — تبدیل واحد فقط یک بار در مرز درگاه', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchCapture() {
    const captured: { body?: any } = {};
    global.fetch = jest.fn(async (_url: any, init?: any) => {
      captured.body = init?.body ? JSON.parse(init.body) : undefined;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { paymentId: 'P1', orderId: 'ORD-1', paymentUrl: 'http://x/pay/P1' },
        }),
      } as any;
    }) as any;
    return captured;
  }

  it('should send amount ×10 (toman→rial) exactly once — نمونه ۱۰,۰۰۰ تومان', async () => {
    const captured = mockFetchCapture();

    await nikpalService.createPayment({
      amountToman: 10000,
      orderId: 'ORD-1',
      callbackUrl: 'http://localhost:5000/api/v1/payments/callback',
    });

    // ۱۰,۰۰۰ تومان ← ۱۰۰,۰۰۰ ریال (نه ۱۰,۰۰۰ و نه ۱,۰۰۰,۰۰۰ = بدون تبدیل دوباره)
    expect(captured.body.amount).toBe(100000);
  });

  it('should send 1,000,000 toman as 10,000,000 rial', async () => {
    const captured = mockFetchCapture();

    await nikpalService.createPayment({
      amountToman: 1000000,
      orderId: 'ORD-2',
      callbackUrl: 'http://localhost:5000/api/v1/payments/callback',
    });

    expect(captured.body.amount).toBe(10000000);
  });

  it('should reject non-integer toman amount at the boundary (no silent rounding)', async () => {
    mockFetchCapture();

    await expect(
      nikpalService.createPayment({
        amountToman: 999.9,
        orderId: 'ORD-3',
        callbackUrl: 'http://localhost:5000/api/v1/payments/callback',
      }),
    ).rejects.toThrow(RangeError);
  });
});