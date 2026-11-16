/// <reference types="jest" />
/**
 * 💸 تست‌های سرویس واحد بازپرداخت (refund.service)
 *
 * پوشش رگرسیون باگ‌های رفع‌شده:
 *  - بازپرداخت «نرم»: حذف Enrollment فیزیکی ممنوع (پیشرفت دانشجو حفظ شود)
 *  - کسر سهم مدرس از کیف پول (با allowNegative برای رکوردهای قدیمی)
 *  - بازگشت پول کیف‌پولی به کیف پول دانشجو
 *  - کاهش totalRevenue/totalStudents دوره
 *  - بازگرداندن سهم کوپن
 *  - رد بازپرداخت تکراری + پنجره ۳۰ دقیقه‌ای فقط برای درگاه
 */
import './setup';
import mongoose from 'mongoose';
import Payment from '../models/Payment';
import Enrollment from '../models/Enrollment';
import Course from '../models/Course';
import Coupon from '../models/Coupon';
import User from '../models/User';
import WalletTransaction from '../models/WalletTransaction';
import { refundService } from '../services/refund.service';
import { PaymentStatus } from '../types';
import {
  createStudent,
  createInstructor,
  createAdmin,
  createCourse,
  createCoupon,
} from './factories';

jest.mock('../controllers/notificationController', () => ({
  createNotification: jest.fn().mockResolvedValue(null),
}));

const REFUND_REASON = 'بازپرداخت آزمایشی برای تست';

function uniqueOrder(): string {
  return `ORD-REFUND-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * ساخت یک خرید کاملِ شبیه‌سازی‌شده (پرداخت + ثبت‌نام + شمارنده‌ها + سهم مدرس)
 */
async function seedPurchase(options: {
  paymentMethod?: 'wallet' | 'nikpal' | 'free';
  price?: number;
  instructorShare?: number;
  coupon?: any;
  verifiedMinutesAgo?: number;
}) {
  const {
    paymentMethod = 'wallet',
    price = 10000,
    instructorShare = 7000,
    coupon = null,
    verifiedMinutesAgo,
  } = options;

  const instructor = await createInstructor();
  const student = await createStudent();
  const admin = await createAdmin();
  const course = await createCourse(instructor._id, { price });

  // وضعیت «بعد از خرید موفق»
  if (paymentMethod === 'wallet') {
    student.wallet = {
      balance: 0, // ۱۰,۰۰۰ خرج شده
      totalDeposited: price,
      totalWithdrawn: 0,
      totalSpent: price,
    };
    await student.save();
  }
  instructor.wallet = {
    balance: instructorShare,
    totalDeposited: instructorShare,
    totalWithdrawn: 0,
    totalSpent: 0,
  };
  instructor.instructorProfile!.totalEarnings = instructorShare;
  await instructor.save();

  await Course.findByIdAndUpdate(course._id, {
    $inc: { totalStudents: 1, totalRevenue: instructorShare },
  });

  const payment = await Payment.create({
    user: student._id,
    orderNumber: uniqueOrder(),
    items: [
      {
        course: course._id,
        price,
        adjustedPrice: price,
        instructorShare,
        platformShare: price - instructorShare,
      },
    ],
    totalAmount: price,
    discountAmount: 0,
    finalAmount: price,
    paymentMethod,
    status: PaymentStatus.SUCCESS,
    paidAt: new Date(),
    verifiedAt: verifiedMinutesAgo
      ? new Date(Date.now() - verifiedMinutesAgo * 60 * 1000)
      : new Date(),
    ...(coupon ? { coupon: coupon._id } : {}),
  });

  await Enrollment.create({
    student: student._id,
    course: course._id,
    payment: payment._id,
    pricePaid: price,
    ...(coupon ? { couponUsed: coupon._id } : {}),
  });

  return { instructor, student, admin, course, payment, price, instructorShare };
}

describe('Refund Service', () => {
  describe('بازپرداخت نرم (Enrollment soft-delete)', () => {
    it('should soft-delete enrollment (not physical delete)', async () => {
      const { student, course, payment, admin } = await seedPurchase({});

      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );
      expect(result.enrollmentSoftDeleted).toBe(true);

      // ⚠️ رگرسیون: سند Enrollment نباید حذف فیزیکی شود (پیشرفت/گواهی دانشجو)
      const enrollment = await Enrollment.findOne({
        student: student._id,
        course: course._id,
      });
      expect(enrollment).not.toBeNull();
      expect(enrollment!.isRefunded).toBe(true);
      expect(enrollment!.refundedAt).not.toBeNull();
      expect(enrollment!.refundReason).toBe(REFUND_REASON);
    });

    it('should mark payment as REFUNDED with admin identity', async () => {
      const { payment, admin } = await seedPurchase({});

      await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );

      const refreshed = await Payment.findById(payment._id);
      expect(refreshed!.status).toBe(PaymentStatus.REFUNDED);
      expect(refreshed!.isRefunded).toBe(true);
      expect(refreshed!.refundedBy!.toString()).toBe(admin._id.toString());
      expect(refreshed!.refundReason).toBe(REFUND_REASON);
      expect(refreshed!.refundAmount).toBe(10000);
    });
  });

  describe('جابجایی پول در بازپرداخت', () => {
    it('should deduct instructor share from wallet', async () => {
      const { instructor, payment, admin } = await seedPurchase({});

      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );
      expect(result.instructorDeducted).toBe(true);

      const refreshed = await User.findById(instructor._id);
      expect(refreshed!.wallet.balance).toBe(0);
      expect(refreshed!.instructorProfile!.totalEarnings).toBe(0);

      // ثبت در دفتر کل با createdBy ادمین
      const entry = await WalletTransaction.findOne({
        user: instructor._id,
        type: 'debit',
        reason: 'refund',
      });
      expect(entry).not.toBeNull();
      expect(entry!.amount).toBe(7000);
      expect(entry!.createdBy!.toString()).toBe(admin._id.toString());
    });

    it('should allow instructor debt (negative balance) for legacy unsplit records', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const admin = await createAdmin();
      const course = await createCourse(instructor._id, { price: 10000 });

      // رکورد قدیمی: سهم هرگز واریز نشده — موجودی مدرس صفر
      const payment = await Payment.create({
        user: student._id,
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
        verifiedAt: new Date(), // در پنجره ۳۰ دقیقه
      });
      await Enrollment.create({
        student: student._id,
        course: course._id,
        payment: payment._id,
        pricePaid: 10000,
      });

      // بازپرداخت نباید به خاطر موجودی صفر مدرس شکست بخورد (allowNegative)
      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );
      expect(result.instructorDeducted).toBe(true);

      const refreshed = await User.findById(instructor._id);
      expect(refreshed!.wallet.balance).toBe(-7000); // بدهی آینده
    });

    it('should return money to student wallet for wallet purchases', async () => {
      const { student, payment, admin, price } = await seedPurchase({
        paymentMethod: 'wallet',
      });

      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );
      expect(result.moneyReturned).toBe(true);

      const refreshed = await User.findById(student._id);
      expect(refreshed!.wallet.balance).toBe(price); // ۰ + بازگشت کامل

      // بازگشت وجه باید totalSpent را کم کند (نه totalDeposited را زیاد)
      expect(refreshed!.wallet.totalSpent).toBe(0);
      expect(refreshed!.wallet.totalDeposited).toBe(price);

      const entry = await WalletTransaction.findOne({
        user: student._id,
        type: 'credit',
        reason: 'refund',
      });
      expect(entry).not.toBeNull();
      expect(entry!.amount).toBe(price);
    });

    it('should mark gateway purchases as REFUND_PENDING (manual gateway refund)', async () => {
      const { student, payment, admin } = await seedPurchase({
        paymentMethod: 'nikpal',
        verifiedMinutesAgo: 5,
      });

      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );

      // پول درگاهی دستی برمی‌گردد — سیستم فقط علامت می‌زند
      expect(result.moneyReturned).toBe(false);
      const refreshedPayment = await Payment.findById(payment._id);
      expect(refreshedPayment!.callbackStatus).toBe('REFUND_PENDING');

      // پولی به کیف دانشجو برنگشته
      const refreshedStudent = await User.findById(student._id);
      expect(refreshedStudent!.wallet.balance).toBe(0);
    });
  });

  describe('اصلاح آمار دوره و کوپن', () => {
    it('should decrement Course.totalRevenue and totalStudents', async () => {
      const { course, payment, admin } = await seedPurchase({});

      await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );

      const refreshed = await Course.findById(course._id);
      expect(refreshed!.totalStudents).toBe(0);
      expect(refreshed!.totalRevenue).toBe(0);
    });

    it('should restore coupon usage count and usedBy entry', async () => {
      const coupon = await createCoupon({
        discountValue: 10,
        usedCount: 1,
        usageLimit: 10,
      });
      const { payment, admin, student } = await seedPurchase({ coupon });

      // usedBy را مثل مسیر خرید واقعی پر کن
      coupon.usedBy = [
        {
          user: student._id,
          usedAt: new Date(),
          payment: payment._id,
        } as any,
      ];
      await coupon.save();

      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );
      expect(result.couponRestored).toBe(true);

      const refreshed = await Coupon.findById(coupon._id);
      expect(refreshed!.usedCount).toBe(0);
      // فقط همین پرداخت حذف شده — نه همه‌ی مصارف کاربر
      expect(refreshed!.usedBy).toHaveLength(0);
    });
  });

  describe('گاردهای ایمنی بازپرداخت', () => {
    it('should reject refund for already-refunded payment (idempotency)', async () => {
      const { payment, admin } = await seedPurchase({});

      await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );

      // تلاش دوم باید رد شود — وضعیت دیگر SUCCESS نیست
      await expect(
        refundService.processRefund(
          payment._id.toString(),
          admin._id.toString(),
          REFUND_REASON,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });

      // اثرات مالی فقط یک‌بار اعمال شده
      const instructorShareEntries = await WalletTransaction.countDocuments({
        reason: 'refund',
        type: 'debit',
      });
      expect(instructorShareEntries).toBe(1);
    });

    it('should reject refund for non-successful payment', async () => {
      const instructor = await createInstructor();
      const student = await createStudent();
      const admin = await createAdmin();
      const course = await createCourse(instructor._id, { price: 10000 });

      const payment = await Payment.create({
        user: student._id,
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
        status: PaymentStatus.PENDING,
      });

      await expect(
        refundService.processRefund(
          payment._id.toString(),
          admin._id.toString(),
          REFUND_REASON,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should enforce 30-min window for gateway payments', async () => {
      const { payment, admin } = await seedPurchase({
        paymentMethod: 'nikpal',
        verifiedMinutesAgo: 31, // یک دقیقه از پنجره گذشته
      });

      await expect(
        refundService.processRefund(
          payment._id.toString(),
          admin._id.toString(),
          REFUND_REASON,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });

      // پرداخت دست‌نخورده باقی مانده
      const refreshed = await Payment.findById(payment._id);
      expect(refreshed!.status).toBe(PaymentStatus.SUCCESS);
      expect(refreshed!.isRefunded).toBe(false);
    });

    it('should NOT enforce time window for wallet purchases (internal money)', async () => {
      // خرید کیف پولی «یک ساعت» قبل — بدون محدودیت زمانی قابل بازپرداخت است
      const { student, payment, admin } = await seedPurchase({
        paymentMethod: 'wallet',
      });
      await Payment.findByIdAndUpdate(payment._id, {
        $set: { verifiedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });

      const result = await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );
      expect(result.moneyReturned).toBe(true);

      const refreshedStudent = await User.findById(student._id);
      expect(refreshedStudent!.wallet.balance).toBe(10000);
    });

    it('should reject refund with non-existent payment id', async () => {
      const admin = await createAdmin();

      await expect(
        refundService.processRefund(
          new mongoose.Types.ObjectId().toString(),
          admin._id.toString(),
          REFUND_REASON,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('should process multi-item payment completely', async () => {
      // سبد دو دوره‌ای: هر دو قلم باید بازپرداخت شوند
      const instructor = await createInstructor();
      const student = await createStudent();
      const admin = await createAdmin();
      const course1 = await createCourse(instructor._id, { price: 10000 });
      const course2 = await createCourse(instructor._id, { price: 20000 });

      instructor.wallet = {
        balance: 21000, // ۷۰٪ × ۳۰,۰۰۰
        totalDeposited: 21000,
        totalWithdrawn: 0,
        totalSpent: 0,
      };
      await instructor.save();

      const payment = await Payment.create({
        user: student._id,
        orderNumber: uniqueOrder(),
        items: [
          {
            course: course1._id,
            price: 10000,
            adjustedPrice: 10000,
            instructorShare: 7000,
            platformShare: 3000,
          },
          {
            course: course2._id,
            price: 20000,
            adjustedPrice: 20000,
            instructorShare: 14000,
            platformShare: 6000,
          },
        ],
        totalAmount: 30000,
        finalAmount: 30000,
        paymentMethod: 'nikpal',
        status: PaymentStatus.SUCCESS,
        paidAt: new Date(),
        verifiedAt: new Date(),
      });
      await Enrollment.create({
        student: student._id,
        course: course1._id,
        payment: payment._id,
        pricePaid: 10000,
      });
      await Enrollment.create({
        student: student._id,
        course: course2._id,
        payment: payment._id,
        pricePaid: 20000,
      });
      await Course.findByIdAndUpdate(course1._id, {
        $inc: { totalStudents: 1, totalRevenue: 7000 },
      });
      await Course.findByIdAndUpdate(course2._id, {
        $inc: { totalStudents: 1, totalRevenue: 14000 },
      });

      await refundService.processRefund(
        payment._id.toString(),
        admin._id.toString(),
        REFUND_REASON,
      );

      // هر دو ثبت‌نام نرم‌حذف شدند
      const enrollments = await Enrollment.find({
        student: student._id,
        isRefunded: true,
      });
      expect(enrollments).toHaveLength(2);

      // سهم هر دو دوره از مدرس کسر شد (۷۰۰۰ + ۱۴۰۰۰)
      const refreshedInstructor = await User.findById(instructor._id);
      expect(refreshedInstructor!.wallet.balance).toBe(0);

      // آمار هر دو دوره صفر شد
      const c1 = await Course.findById(course1._id);
      const c2 = await Course.findById(course2._id);
      expect(c1!.totalStudents).toBe(0);
      expect(c1!.totalRevenue).toBe(0);
      expect(c2!.totalStudents).toBe(0);
      expect(c2!.totalRevenue).toBe(0);
    });
  });
});
