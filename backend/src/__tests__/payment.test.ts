/// <reference types="jest" />
/**
 * 💳 تست‌های جامع سیستم پرداخت (کنترلر createPayment + verify)
 *
 * پوشش:
 *  - پرداخت رایگان (ثبت‌نام + سهم صفر + جلوگیری از ثبت‌نام تکراری)
 *  - پرداخت کیف پولی (کسر اتمیک، سهم مدرس، rollback، ضد double-spend)
 *  - پرداخت درگاهی (PENDING + آدرس درگاه، عدم FAILED شدن با خطای موقت)
 *  - کوپن (سهم مدرس بعد از تخفیف، دامنه، سقف کل/فردی، اولین خرید)
 *
 * درگاه NikPal کاملاً ماک شده — هیچ تماس شبکه‌ای واقعی انجام نمی‌شود.
 */
import './setup';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment';
import Enrollment from '../models/Enrollment';
import Course from '../models/Course';
import Coupon from '../models/Coupon';
import User from '../models/User';
import WalletTransaction from '../models/WalletTransaction';
import { createPayment, verifyPaymentEndpoint } from '../controllers/paymentController';
import { errorHandler } from '../middlewares/errorHandler';
import { PaymentStatus } from '../types';
import { nikpalService, NikpalError } from '../services/nikpal.service';
import { createStudent, createInstructor, createCourse, createCoupon } from './factories';

// ─── ماک‌ها (پیش از importهای بالا هایست می‌شوند) ───
jest.mock('../config/nikpal', () => {
  const config = {
    apiKey: 'test-api-key',
    baseUrl: 'http://localhost:3000',
    callbackUrl: 'http://localhost:5000/api/v1/payments/callback',
    frontendSuccessUrl: 'http://localhost:4200/payment/success',
    frontendFailureUrl: 'http://localhost:4200/payment/failure',
    isPaymentEnabled: true,
    timeout: 15000,
    maxRetries: 2,
  };
  return { nikpalConfig: config, default: config };
});

jest.mock('../services/nikpal.service', () => {
  const actual = jest.requireActual('../services/nikpal.service');
  return {
    ...actual,
    nikpalService: {
      createPayment: jest.fn(),
      verifyPayment: jest.fn(),
      getPaymentStatus: jest.fn(),
      getPaymentUrl: jest.fn((id: string) => `http://localhost:3000/pay/${id}`),
    },
  };
});

jest.mock('../controllers/notificationController', () => ({
  createNotification: jest.fn().mockResolvedValue(null),
}));

const mockNikpalCreate = nikpalService.createPayment as jest.Mock;
const mockNikpalVerify = nikpalService.verifyPayment as jest.Mock;

// ─── اپ تستی: فقط کنترلرهای مالی + errorHandler ───
let currentUser: any = null;

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).user = currentUser;
  next();
});
app.post('/payments', createPayment);
app.post('/payments/verify', verifyPaymentEndpoint);
app.use(errorHandler);

function uniqueOrder(): string {
  return `ORD-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(() => {
  currentUser = null;
  mockNikpalCreate.mockReset();
  mockNikpalVerify.mockReset();
});

describe('Payment System', () => {
  // ══════════════════ پرداخت رایگان ══════════════════
  describe('createPayment — Free', () => {
    it('should create free enrollment when finalAmount is 0', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 0, isFree: true });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'nikpal' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const payment = await Payment.findOne({ user: student._id });
      expect(payment).not.toBeNull();
      expect(payment!.status).toBe(PaymentStatus.SUCCESS);
      expect(payment!.paymentMethod).toBe('free');
      expect(payment!.finalAmount).toBe(0);

      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: course._id,
      });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.isRefunded).toBe(false);

      const refreshedCourse = await Course.findById(course._id);
      expect(refreshedCourse!.totalStudents).toBe(1);
    });

    it('should set instructorShare to 0 for free payments', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 0, isFree: true });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()] });

      const payment = await Payment.findOne({ user: student._id });
      expect(payment!.items[0].instructorShare).toBe(0);
      expect(payment!.items[0].platformShare).toBe(0);

      // هیچ پولی جابجا نشده → کیف مدرس نباید تغییر کند
      const refreshedInstructor = await User.findById(instructor._id);
      expect(refreshedInstructor!.wallet.balance).toBe(0);
    });

    it('should prevent duplicate enrollment for same course', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 0, isFree: true });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const first = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()] });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()] });

      expect(second.status).toBe(409);
      expect(await Enrollment.countDocuments({ student: student._id })).toBe(1);
      // شمارنده دوره دوبار افزایش نیافته (رگرسیون FIX H2)
      const refreshedCourse = await Course.findById(course._id);
      expect(refreshedCourse!.totalStudents).toBe(1);
    });
  });

  // ══════════════════ پرداخت کیف پولی ══════════════════
  describe('createPayment — Wallet', () => {
    it('should deduct balance atomically and link ledger to payment', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 50000, totalDeposited: 50000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'wallet' });

      expect(res.status).toBe(201);

      const refreshed = await User.findById(student._id);
      expect(refreshed!.wallet.balance).toBe(40000);
      expect(refreshed!.wallet.totalSpent).toBe(10000);

      // رکورد دفتر کلِ خرید با شناسه‌ی پرداخت لینک شده (backfill)
      const ledger = await WalletTransaction.findOne({
        user: student._id,
        type: 'debit',
        reason: 'purchase',
      });
      expect(ledger).not.toBeNull();
      expect(ledger!.amount).toBe(10000);
      expect(ledger!.balanceAfter).toBe(40000);
      expect(ledger!.relatedPayment).not.toBeNull();
    });

    it('should reject when balance is insufficient without side effects', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 5000, totalDeposited: 5000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'wallet' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('موجودی کیف پول کافی نیست');

      // هیچ چیزی ثبت نشده
      const refreshed = await User.findById(student._id);
      expect(refreshed!.wallet.balance).toBe(5000);
      expect(await Payment.countDocuments({ user: student._id })).toBe(0);
      expect(await WalletTransaction.countDocuments({ user: student._id })).toBe(0);
      expect(await Enrollment.countDocuments({ student: student._id })).toBe(0);
    });

    it('should credit instructor wallet on success (70% share)', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 20000, totalDeposited: 20000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'wallet' });
      expect(res.status).toBe(201);

      const refreshedInstructor = await User.findById(instructor._id);
      expect(refreshedInstructor!.wallet.balance).toBe(7000);
      expect(refreshedInstructor!.instructorProfile!.totalEarnings).toBe(7000);

      const shareEntry = await WalletTransaction.findOne({
        user: instructor._id,
        type: 'credit',
        reason: 'instructor_share',
      });
      expect(shareEntry).not.toBeNull();
      expect(shareEntry!.amount).toBe(7000);

      // آمار دوره
      const refreshedCourse = await Course.findById(course._id);
      expect(refreshedCourse!.totalStudents).toBe(1);
      expect(refreshedCourse!.totalRevenue).toBe(7000);
    });

    it('should rollback balance on transaction failure', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 30000, totalDeposited: 30000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      // شبیه‌سازی خطای دیتابیس وسط تراکنش (بعد از کسر موجودی)
      const spy = jest
        .spyOn(Enrollment, 'create')
        .mockRejectedValueOnce(new Error('simulated db failure') as any);

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'wallet' });

      expect(res.status).toBe(500);
      spy.mockRestore();

      // ⚠️ رگرسیون: کسر موجودی باید کاملاً rollback شود
      const refreshed = await User.findById(student._id);
      expect(refreshed!.wallet.balance).toBe(30000);
      expect(refreshed!.wallet.totalSpent).toBe(0);
      expect(await Payment.countDocuments({ user: student._id })).toBe(0);
      expect(await WalletTransaction.countDocuments({ user: student._id })).toBe(0);

      const refreshedInstructor = await User.findById(instructor._id);
      expect(refreshedInstructor!.wallet.balance).toBe(0);
    });

    it('should handle concurrent purchases (double-spend prevention)', async () => {
      const instructor = await createInstructor();
      // موجودی دقیقاً برای «یک» خرید ۱۰,۰۰۰ تومانی کافی است
      const student = await createStudent({
        wallet: { balance: 10000, totalDeposited: 10000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const [r1, r2] = await Promise.all([
        request(app)
          .post('/payments')
          .send({ courseIds: [course._id.toString()], paymentMethod: 'wallet' }),
        request(app)
          .post('/payments')
          .send({ courseIds: [course._id.toString()], paymentMethod: 'wallet' }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 400]);

      // موجودی فقط یک‌بار کسر شده و فقط یک پرداخت موفق وجود دارد
      const refreshed = await User.findById(student._id);
      expect(refreshed!.wallet.balance).toBe(0);
      expect(
        await Payment.countDocuments({ user: student._id, status: PaymentStatus.SUCCESS }),
      ).toBe(1);
      expect(await Enrollment.countDocuments({ student: student._id })).toBe(1);
    });
  });

  // ══════════════════ پرداخت درگاهی ══════════════════
  describe('createPayment — Gateway', () => {
    it('should create PENDING payment and return gateway URL', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 25000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      mockNikpalCreate.mockResolvedValue({
        paymentId: 'AUTH-123',
        orderId: expect.any(String),
        paymentUrl: 'http://localhost:3000/pay/AUTH-123',
      });

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'nikpal' });

      expect(res.status).toBe(201);
      expect(res.body.data.gatewayUrl).toBe('http://localhost:3000/pay/AUTH-123');

      // 💱 قرارداد واحد پول: کنترلر مبلغ داخلی (تومان) را به adapter می‌دهد؛
      // تبدیل تومان→ریال فقط داخل adapter (nikpal.service) انجام می‌شود
      expect(mockNikpalCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amountToman: 25000 }),
      );

      const payment = await Payment.findOne({ user: student._id });
      expect(payment!.status).toBe(PaymentStatus.PENDING);
      expect(payment!.gatewayAuthority).toBe('AUTH-123');

      // تا verify موفق، ثبت‌نامی صادر نشده
      expect(await Enrollment.countDocuments({ student: student._id })).toBe(0);
    });

    it('should mark FAILED on explicit gateway rejection (4xx)', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 25000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      mockNikpalCreate.mockRejectedValue(
        new NikpalError('درگاه درخواست را رد کرد', 400, 'BAD_REQUEST'),
      );

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'nikpal' });

      expect(res.status).toBe(400);
      const payment = await Payment.findOne({ user: student._id });
      expect(payment!.status).toBe(PaymentStatus.FAILED);
    });

    it('should map gateway 401/403 to 502 to prevent fake logout', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 25000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      mockNikpalCreate.mockRejectedValue(new NikpalError('کلید API نامعتبر', 401, 'UNAUTHORIZED'));

      const res = await request(app)
        .post('/payments')
        .send({ courseIds: [course._id.toString()], paymentMethod: 'nikpal' });

      // ⚠️ رگرسیون: ۴۰۱ درگاه نباید به کلاینت ۴۰۱ برگردد (auth.interceptor باعث لاگاوت جعلی می‌شود)
      expect(res.status).toBe(502);
    });

    it('should keep PENDING on temporary network error during verify (not FAILED)', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 25000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 25000,
            adjustedPrice: 25000,
            instructorShare: 17500,
            platformShare: 7500,
          },
        ],
        totalAmount: 25000,
        finalAmount: 25000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.PENDING,
        gatewayAuthority: 'AUTH-NET-ERR',
      });

      // خطای شبکه‌ی موقت (نه ردِ صریحِ درگاه)
      mockNikpalVerify.mockRejectedValue(new Error('fetch failed: network down'));

      const res = await request(app).post('/payments/verify').send({ paymentId: 'AUTH-NET-ERR' });

      expect(res.status).toBe(500);

      // ⚠️ رگرسیون: پرداخت نباید FAILED شود — باید PENDING بماند تا verify مجدد
      const payment = await Payment.findOne({ gatewayAuthority: 'AUTH-NET-ERR' });
      expect(payment!.status).toBe(PaymentStatus.PENDING);
      expect(payment!.verifyAttemptCount).toBe(1);
      expect(payment!.lastVerifyError).toContain('fetch failed');
    });

    it('should mark FAILED on explicit verify rejection (NikpalError 4xx)', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 25000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 25000,
            adjustedPrice: 25000,
            instructorShare: 17500,
            platformShare: 7500,
          },
        ],
        totalAmount: 25000,
        finalAmount: 25000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.PENDING,
        gatewayAuthority: 'AUTH-REJECTED',
      });

      mockNikpalVerify.mockRejectedValue(new NikpalError('تراکنش قابل تأیید نیست', 422, 'INVALID'));

      const res = await request(app).post('/payments/verify').send({ paymentId: 'AUTH-REJECTED' });

      expect(res.status).toBe(400);
      const payment = await Payment.findOne({ gatewayAuthority: 'AUTH-REJECTED' });
      expect(payment!.status).toBe(PaymentStatus.FAILED);
    });

    it('should finalize successful verify: enrollment + instructor share', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 20000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 20000,
            adjustedPrice: 20000,
            instructorShare: 14000,
            platformShare: 6000,
          },
        ],
        totalAmount: 20000,
        finalAmount: 20000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.PENDING,
        gatewayAuthority: 'AUTH-OK',
      });

      mockNikpalVerify.mockResolvedValue({
        paymentId: 'AUTH-OK',
        orderId: 'ORD-X',
        status: 'PAID',
        amount: 200000, // 20,000 تومان × 10 = 200,000 ریال (قرارداد NikPal)
        referenceId: 'REF-1',
      });

      const res = await request(app).post('/payments/verify').send({ paymentId: 'AUTH-OK' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAID');

      const payment = await Payment.findOne({ gatewayAuthority: 'AUTH-OK' });
      expect(payment!.status).toBe(PaymentStatus.SUCCESS);
      expect(payment!.gatewayRefId).toBe('REF-1');

      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: course._id,
      });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.pricePaid).toBe(20000);

      const refreshedInstructor = await User.findById(instructor._id);
      expect(refreshedInstructor!.wallet.balance).toBe(14000);
    });

    it('should REJECT verify when gateway amount mismatches order amount (H5 fixed)', async () => {
      // ✅ FIX H5: مبلغ تأییدشده درگاه (ریال) باید با مبلغ سفارش (تومان) تطبیق داده شود.
      // 30,000 تومان = 300,000 ریال؛ درگاه 999 ریال برگردانده → ردِ قطعی.
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 30000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 30000,
            adjustedPrice: 30000,
            instructorShare: 21000,
            platformShare: 9000,
          },
        ],
        totalAmount: 30000,
        finalAmount: 30000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.PENDING,
        gatewayAuthority: 'AUTH-AMT',
      });

      mockNikpalVerify.mockResolvedValue({
        paymentId: 'AUTH-AMT',
        orderId: 'ORD-Y',
        status: 'PAID',
        amount: 999, // مبلغ مغایر از درگاه (ریال)
        referenceId: 'REF-2',
      });

      const res = await request(app).post('/payments/verify').send({ paymentId: 'AUTH-AMT' });

      // ❌ رگرسیون: مبلغ مغایر نباید پذیرفته شود
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('مطابقت ندارد');

      const payment = await Payment.findOne({ gatewayAuthority: 'AUTH-AMT' });
      expect(payment!.status).toBe(PaymentStatus.FAILED);
      expect(payment!.failureReason).toContain('مطابقت ندارد');
      // دسترسی به دوره صادر نشده + سهم مدرس واریز نشده
      expect(await Enrollment.findOne({ student: student._id })).toBeNull();
      const refreshedInstructor = await User.findById(instructor._id);
      expect(refreshedInstructor!.wallet.balance).toBe(0);
    });

    it('should ACCEPT verify when gateway amount matches (toman→rial ×10)', async () => {
      // 💱 30,000 تومان باید به 300,000 ریال تبدیل و تطبیق داده شود
      const instructor = await createInstructor();
      const student = await createStudent();
      const course = await createCourse(instructor._id, { price: 30000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 30000,
            adjustedPrice: 30000,
            instructorShare: 21000,
            platformShare: 9000,
          },
        ],
        totalAmount: 30000,
        finalAmount: 30000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.PENDING,
        gatewayAuthority: 'AUTH-AMT-OK',
      });

      mockNikpalVerify.mockResolvedValue({
        paymentId: 'AUTH-AMT-OK',
        orderId: 'ORD-OK',
        status: 'PAID',
        amount: 300000, // 30,000 تومان × 10 = 300,000 ریال ✅
        referenceId: 'REF-OK',
      });

      const res = await request(app).post('/payments/verify').send({ paymentId: 'AUTH-AMT-OK' });

      expect(res.status).toBe(200);
      const payment = await Payment.findOne({ gatewayAuthority: 'AUTH-AMT-OK' });
      expect(payment!.status).toBe(PaymentStatus.SUCCESS);
      expect(payment!.finalAmount).toBe(30000); // مبلغ داخلی به تومان دست‌نخورده
      const enrollment = await Enrollment.findOne({ student: student._id });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.pricePaid).toBe(30000);
    });

    it('should forbid verify by non-owner (anti-IDOR)', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const stranger = await createStudent();
      const course = await createCourse(instructor._id, { price: 25000 });

      await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 25000,
            adjustedPrice: 25000,
            instructorShare: 17500,
            platformShare: 7500,
          },
        ],
        totalAmount: 25000,
        finalAmount: 25000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.PENDING,
        gatewayAuthority: 'AUTH-IDOR',
      });

      currentUser = { _id: stranger._id, email: stranger.email, role: 'student' };
      mockNikpalVerify.mockResolvedValue({
        paymentId: 'AUTH-IDOR',
        status: 'PAID',
        amount: 25000,
      });

      const res = await request(app).post('/payments/verify').send({ paymentId: 'AUTH-IDOR' });

      expect(res.status).toBe(403);
      const payment = await Payment.findOne({ gatewayAuthority: 'AUTH-IDOR' });
      expect(payment!.status).toBe(PaymentStatus.PENDING);
    });
  });

  // ══════════════════ کوپن ══════════════════
  describe('Coupon', () => {
    it('should calculate instructor share AFTER discount (not on raw price)', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 100000, totalDeposited: 100000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 100000 });
      const coupon = await createCoupon({ discountValue: 80 }); // ۸۰٪
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });

      expect(res.status).toBe(201);

      const payment = await Payment.findOne({ user: student._id });
      expect(payment!.discountAmount).toBe(80000);
      expect(payment!.finalAmount).toBe(20000);

      // ⚠️ رگرسیون CRITICAL: سهم مدرس باید روی قیمت «بعد از تخفیف» حساب شود
      // (۷۰٪ × ۲۰,۰۰۰ = ۱۴,۰۰۰ — نه ۷۰,۰۰۰ روی قیمت خام)
      expect(payment!.items[0].adjustedPrice).toBe(20000);
      expect(payment!.items[0].instructorShare).toBe(14000);
      expect(payment!.items[0].platformShare).toBe(6000);

      const studentWallet = await User.findById(student._id);
      expect(studentWallet!.wallet.balance).toBe(80000);

      const instructorWallet = await User.findById(instructor._id);
      expect(instructorWallet!.wallet.balance).toBe(14000);

      // جمع سهم‌ها دقیقاً برابر مبلغ پرداخت‌شده (بدون نشت رندینگ)
      const sumShares = payment!.items.reduce(
        (acc, it) => acc + it.instructorShare + it.platformShare,
        0,
      );
      expect(sumShares).toBe(payment!.finalAmount);
    });

    it('should reject coupon for excluded courses', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 50000, totalDeposited: 50000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      const coupon = await createCoupon({ excludedCourses: [course._id] });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('مستثنی');
      expect(await Payment.countDocuments({ user: student._id })).toBe(0);
    });

    it('should enforce usageLimit atomically (sequential rejection after exhaustion)', async () => {
      const instructor = await createInstructor();
      const student1 = await createStudent({
        wallet: { balance: 20000, totalDeposited: 20000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const student2 = await createStudent({
        wallet: { balance: 20000, totalDeposited: 20000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      const coupon = await createCoupon({ discountValue: 10, usageLimit: 1 });

      // خرید اول → موفق، usedCount = 1
      currentUser = { _id: student1._id, email: student1.email, role: 'student' };
      const first = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });
      expect(first.status).toBe(201);

      const afterFirst = await Coupon.findById(coupon._id);
      expect(afterFirst!.usedCount).toBe(1);
      expect(afterFirst!.usedBy).toHaveLength(1);
      expect(afterFirst!.usedBy[0].user.toString()).toBe(student1._id.toString());

      // خرید دوم → سقف تکمیل شده
      currentUser = { _id: student2._id, email: student2.email, role: 'student' };
      const second = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });
      expect(second.status).toBe(400);
      expect(second.body.message).toContain('ظرفیت');
    });

    it('should enforce usageLimitPerUser', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 50000, totalDeposited: 50000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course1 = await createCourse(instructor._id, { price: 10000 });
      const course2 = await createCourse(instructor._id, { price: 10000 });
      const coupon = await createCoupon({ discountValue: 10, usageLimitPerUser: 1 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const first = await request(app)
        .post('/payments')
        .send({
          courseIds: [course1._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/payments')
        .send({
          courseIds: [course2._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });
      expect(second.status).toBe(400);
      expect(second.body.message).toContain('استفاده کرده‌اید');
    });

    it('should reject isFirstPurchaseOnly coupon for returning users', async () => {
      const instructor = await createInstructor();
      const returning = await createStudent({
        wallet: { balance: 50000, totalDeposited: 50000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const fresh = await createStudent({
        wallet: { balance: 50000, totalDeposited: 50000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      const coupon = await createCoupon({ discountValue: 10, isFirstPurchaseOnly: true });

      // کاربر برگشته: یک خرید درگاهی موفق قبلی دارد
      await Payment.create({
        user: returning._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course._id,
            price: 10000,
            adjustedPrice: 10000,
            instructorShare: 7000,
            platformShare: 3000,
          },
        ],
        totalAmount: 10000,
        finalAmount: 10000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
      });

      currentUser = { _id: returning._id, email: returning.email, role: 'student' };
      const rejected = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toContain('اولین خرید');

      // کاربر تازه‌وارد می‌تواند استفاده کند
      currentUser = { _id: fresh._id, email: fresh.email, role: 'student' };
      const accepted = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: coupon.code,
        });
      expect(accepted.status).toBe(201);
    });

    it('should reject expired or invalid coupon', async () => {
      const instructor = await createInstructor();
      const student = await createStudent({
        wallet: { balance: 20000, totalDeposited: 20000, totalWithdrawn: 0, totalSpent: 0 },
      });
      const course = await createCourse(instructor._id, { price: 10000 });
      currentUser = { _id: student._id, email: student.email, role: 'student' };

      const res = await request(app)
        .post('/payments')
        .send({
          courseIds: [course._id.toString()],
          paymentMethod: 'wallet',
          couponCode: 'DOES-NOT-EXIST',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('نامعتبر');
    });
  });
});
