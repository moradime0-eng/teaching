/**
 * 💸 سرویس واحد بازپرداخت — تنها مسیر معتبرِ برگشت پول
 *
 * ⚠️ FIX CRITICAL (جایگزین `adminRefund` و `reversePaymentEndpoint` قدیمی):
 *  ۱. بازپرداخت «نرم»: Enrollment هرگز حذف فیزیکی نمی‌شود (isRefunded=true →
 *     پیشرفت/گواهی حفظ می‌شود ولی دسترسی با فیلترهای isRefunded قطع می‌شود)
 *  ۲. همه‌ی تغییرات مالی (وضعیت پرداخت + سهم مدرس + شمارنده‌های دوره + کوپن
 *     + بستانکاری کیف پول) در «یک» تراکنش MongoDB اتمیک
 *  ۳. هویت ادمین در سند پرداخت ذخیره می‌شود (`refundedBy`)
 *  ۴. پول کیف‌پولی → بستانکاری کیف پول دانشجو | درگاهی → REFUND_PENDING
 *     (بازپرداخت درگاه‌ها در NikPal دستی است — API بازپرداخت ندارد)
 *  ۵. فقط پرداخت‌های success قابل بازپرداخت؛ پنجره‌ی ۳۰ دقیقه فقط برای درگاه
 *
 * ❌ باگ‌های نسخه‌ی قدیمی که این سرویس رفع می‌کند:
 *  - بازپرداخت پول را واقعاً برنمی‌گرداند و سهم مدرس کسر نمی‌شد (زیان پلتفرم)
 *  - Enrollment با findOneAndDelete حذف فیزیکی می‌شد (نابودی پیشرفت دانشجو)
 *  - بدون تراکنش اتمیک (وضعیت نیمه‌کاره در وسط کار)
 *  - هویت ادمین فقط در کنسول لاگ می‌شد
 *  - reversePayment فقط وضعیت را عوض می‌کرد و دانشجو بعد از «بازپرداخت»
 *    همچنان به دوره دسترسی داشت
 */

import mongoose from 'mongoose';
import Payment from '../models/Payment';
import Enrollment from '../models/Enrollment';
import Course from '../models/Course';
import Coupon from '../models/Coupon';
import { PaymentStatus, NotificationType } from '../types';
import { ApiError } from '../utils/ApiError';
import { createNotification } from '../controllers/notificationController';
import { walletService } from './wallet.service';

// ==================== Constants ====================
/** پنجره‌ی بازپرداخت درگاه (فقط nikpal/zarinpal — کیف پول و رایگان بدون محدودیت) */
const REFUND_WINDOW_MINUTES = 30;

// ==================== Types ====================

export interface RefundResult {
  paymentId: string;
  status: string;
  moneyReturned: boolean;
  instructorDeducted: boolean;
  enrollmentSoftDeleted: boolean;
  couponRestored: boolean;
}

// ==================== Service ====================

export class RefundService {
  /**
   * پردازش کامل بازپرداخت یک تراکنش موفق — اتمیک و ایمن.
   *
   * @param paymentId شناسه‌ی سند Payment
   * @param adminId   شناسه‌ی ادمین اجراکننده (در `refundedBy` ذخیره می‌شود)
   * @param reason    دلیل بازپرداخت (حداقل ۵ کاراکتر — در کنترلر هم چک می‌شود)
   */
  async processRefund(
    paymentId: string,
    adminId: string,
    reason: string,
  ): Promise<RefundResult> {
    const session = await mongoose.startSession();
    const result: RefundResult = {
      paymentId,
      status: '',
      moneyReturned: false,
      instructorDeducted: false,
      enrollmentSoftDeleted: false,
      couponRestored: false,
    };

    try {
      await session.withTransaction(async () => {
        // ─── ۱. بارگذاری و اعتبارسنجی پرداخت ───
        const payment = await Payment.findById(paymentId).session(session);
        if (!payment) throw ApiError.notFound('تراکنش یافت نشد');

        // idempotency: بازپرداخت/برگشتِ قبلی یا پرداخت ناموفق/منقضی قابل بازپرداخت نیست
        if (payment.status !== PaymentStatus.SUCCESS) {
          throw ApiError.badRequest(
            `فقط پرداخت‌های موفق قابل بازپرداخت هستند (وضعیت فعلی: ${payment.status})`,
          );
        }

        // ─── ۲. پنجره‌ی بازپرداخت — فقط درگاه (nikpal + رکوردهای قدیمی zarinpal) ───
        // کیف پول و رایگان: بدون محدودیت زمانی (پول داخلی است و فوراً برگشت می‌خورد)
        const isGatewayPayment = !['wallet', 'free'].includes(payment.paymentMethod);
        if (isGatewayPayment && payment.verifiedAt) {
          const minutesSinceVerify =
            (Date.now() - new Date(payment.verifiedAt).getTime()) / 60000;
          if (minutesSinceVerify > REFUND_WINDOW_MINUTES) {
            throw ApiError.badRequest(
              `بازپرداخت درگاه فقط تا ${REFUND_WINDOW_MINUTES} دقیقه پس از تأیید پرداخت امکان‌پذیر است`,
            );
          }
        }

        // ─── ۳. به‌روزرسانی وضعیت پرداخت + ثبت هویت ادمین ───
        payment.status = PaymentStatus.REFUNDED; // نه REVERSED — این بازپرداخت واقعی است
        payment.isRefunded = true;
        payment.refundedAt = new Date();
        payment.refundReason = reason;
        payment.refundAmount = payment.finalAmount;
        payment.refundedBy = new mongoose.Types.ObjectId(adminId);
        if (isGatewayPayment) {
          // NikPal API بازپرداخت ندارد — علامت‌گذاری برای اقدام دستی در پنل درگاه
          payment.callbackStatus = 'REFUND_PENDING';
        }
        await payment.save({ session });

        // ─── ۴ تا ۶. برای هر قلم: بازپرداخت نرم + اصلاح آمار دوره + کسر سهم مدرس ───
        for (const item of payment.items) {
          // ۴. بازپرداخت «نرم» — سند Enrollment حفظ می‌شود (پیشرفت/گواهی دانشجو)
          //    و فقط isRefunded=true می‌شود؛ فیلترهای isRefunded در سراسر اپ دسترسی را قطع می‌کنند
          await Enrollment.findOneAndUpdate(
            { student: payment.user, course: item.course },
            {
              isRefunded: true,
              refundedAt: new Date(),
              refundReason: reason,
            },
            { session },
          );
          result.enrollmentSoftDeleted = true;

          // ۵. اصلاح شمارنده‌های دوره
          await Course.findByIdAndUpdate(
            item.course,
            {
              $inc: {
                totalStudents: -1,
                totalRevenue: -item.instructorShare,
              },
            },
            { session },
          );

          // ۶. کسر سهم مدرس از کیف پول (برای رکوردهای قدیمی که واریز نشده‌اند هم اعمال
          //    می‌شود — موجودی منفیِ مدرس بدهی آینده تلقی می‌شود تا طراحی تسویه)
          if (item.instructorShare > 0) {
            const course = await Course.findById(item.course).session(session);
            if (course?.instructor) {
              // کسر از طریق WalletService: allowNegative برای رکوردهای قدیمیِ
              // وارینشده (بدهی تا تسویه) + ثبت در دفتر کل + totalEarnings
              await walletService.debit(course.instructor, item.instructorShare, {
                reason: 'refund',
                description: `کسر سهم مدرس به دلیل بازپرداخت سفارش ${payment.orderNumber}`,
                secondaryCounter: 'totalDeposited',
                deltaInstructorEarnings: true,
                allowNegative: true,
                relatedPayment: payment._id,
                relatedCourse: item.course,
                createdBy: adminId,
                session,
              });
              result.instructorDeducted = true;
            }
          }
        }

        // ─── ۷. برگشت پول بر اساس روش پرداخت ───
        if (payment.paymentMethod === 'wallet') {
          // خرید از کیف پول → بستانکاری کیف پول دانشجو (همان تراکنش)
          await walletService.credit(payment.user, payment.finalAmount, {
            reason: 'refund',
            description: `بازگشت وجه سفارش ${payment.orderNumber}`,
            secondaryCounter: 'totalSpent',
            relatedPayment: payment._id,
            createdBy: adminId,
            session,
          });
          result.moneyReturned = true;
        } else if (payment.paymentMethod === 'free') {
          result.moneyReturned = true; // پولی جابجا نشده — چیزی برنمی‌گردد
        } else {
          // درگاهی → REFUND_PENDING (در مرحله‌ی ۳ ست شد)؛ بازپرداخت دستی در پنل NikPal
          result.moneyReturned = false;
        }

        // ─── ۸. بازگرداندن سهم کوپن (فقط همین پرداخت؛ نه همه‌ی مصارف کاربر) ───
        if (payment.coupon) {
          await Coupon.findByIdAndUpdate(
            payment.coupon,
            {
              $inc: { usedCount: -1 },
              $pull: { usedBy: { user: payment.user, payment: payment._id } },
            },
            { session },
          );
          result.couponRestored = true;
        }

        result.status = payment.status;
      });
      // withTransaction: کامیت خودکار در موفقیت، abort خودکار در خطا — بدون جبران دستی
    } finally {
      await session.endSession();
    }

    // ─── اعلان‌ها «بعد از تراکنش» (منطقه‌ی امن) — خطای اعلان نباید بازپرداخت را بشکند ───
    try {
      const payment = await Payment.findById(paymentId)
        .populate('items.course', 'title slug instructor')
        .lean();
      const notifications: Promise<unknown>[] = [];

      notifications.push(
        createNotification({
          recipient: payment!.user.toString(),
          type: NotificationType.PAYMENT,
          title: 'بازپرداخت انجام شد',
          message: `بازپرداخت مبلغ ${payment!.finalAmount.toLocaleString('fa-IR')} تومان برای خرید شما با موفقیت ثبت شد.`,
        }),
      );

      for (const item of payment!.items as any[]) {
        if (item.course && (item.course as any).instructor) {
          notifications.push(
            createNotification({
              recipient: (item.course as any).instructor.toString(),
              type: NotificationType.PAYMENT,
              title: 'بازپرداخت سفارش دانشجو',
              message: `مبلغ ${item.instructorShare.toLocaleString('fa-IR')} تومان سهم شما از دوره "${(item.course as any).title}" به دلیل بازپرداخت سفارش کسر شد. دلیل: ${reason}`,
            }),
          );
        }
      }

      await Promise.allSettled(notifications);
    } catch (notifError) {
      console.error('Refund notification failed (non-fatal):', notifError);
    }

    return result;
  }
}

export const refundService = new RefundService();
export default refundService;
