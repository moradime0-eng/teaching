/**
 * 🔁 Job تطبیق پرداخت‌ها (Payment Reconciliation)
 *
 * ⚠️ FIX CRITICAL (رفع H4 — انقضای کورِ پرداخت‌ها):
 * کرونِ قدیمیِ `expirePendingPayments` در cleanupJob هر ۱۰ دقیقه پرداخت‌های
 * PENDING قدیم‌تر از ۳۰ دقیقه را «بدون استعلام از درگاه» EXPIRE می‌کرد.
 * اگر callback تأخیر/گم شده بود و کاربر واقعاً پرداخت کرده بود، پرداخت
 * منقضی می‌شد و دانشجو با وجود پرداخت، به دوره دسترسی نمی‌گرفت.
 *
 * این job جایگزین آن می‌شود:
 *  ۱. هر ۵ دقیقه، حداکثر ۲۰ تراکنش در هر چرخه (ضد rate-limit درگاه)
 *  ۲. PENDING های درگاهی (۵ دقیقه تا ۲۴ ساعت) را با خودِ درگاه استعلام می‌گیرد:
 *     - PAID → `finalizeGatewayPayment` (نهایی‌سازی؛ کاربر فوراً دسترسی می‌گیرد)
 *     - پرداخت‌نشده + قدیمی‌تر از ۳۰ دقیقه → EXPIRE امن (با مدرک درگاه)
 *     - هنوز در انتظار → چرخه‌ی بعد
 *  ۳. P2: پرداخت‌های FAILEDِ قابل‌بازیابی (کمتر از ۵ تلاش ناموفقِ verify و
 *     آخرین تلاش/ایجاد در ۲۴ ساعت اخیر) را هم استعلام می‌گیرد؛ اگر درگاه
 *     بگوید پرداخت شده → نهایی‌سازی (پولِ قفل‌شدهِ پرامپت ۲ نجات پیدا می‌کند)
 *  ۴. خطای درگاه/شبکه → پرداخت رد می‌شود (skip) و چرخه‌ی بعد دوباره — job هرگز نمی‌شکند
 *
 * محدودیت ۲۴ ساعت: تراکنش‌های بسیار قدیمی برای همیشه بررسی نمی‌شوند.
 */

import cron from 'node-cron';
import Payment from '../models/Payment';
import { PaymentStatus } from '../types';
import { nikpalService } from '../services/nikpal.service';
import { finalizeGatewayPayment, GatewayAmountMismatchError } from '../controllers/paymentController';

// ==================== Constants ====================
/** فقط بعد از این سن + تأیید درگاه، PENDING منقضی می‌شود */
const EXPIRE_AFTER_MINUTES = 30;
/** پرداخت‌های جوان‌تر از این بررسی نمی‌شوند (هنوز در حال پرداخت کاربر) */
const MIN_AGE_MINUTES = 5;
/** سقف سن بررسی (جلوگیری از استعلام بی‌پایانِ تراکنش‌های قدیمی) */
const MAX_AGE_HOURS = 24;
/** حداکثر تراکنش در هر چرخه برای هر نوع (ضد rate-limit) */
const BATCH_SIZE = 20;
/** هماهنگ با MAX_VERIFY_ATTEMPTS در paymentController */
const MAX_VERIFY_ATTEMPTS = 5;

// ==================== Helpers ====================

function log(action: string, data: Record<string, any>): void {
  const parts = Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .join(' | ');
  console.log(`[Reconciliation] ${action} | ${parts} | ${new Date().toISOString()}`);
}

// ==================== Job ====================

export function startReconciliationJob(): void {
  // هر ۵ دقیقه — پردازش دسته‌ای
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = Date.now();
      const fiveMinAgo = new Date(now - MIN_AGE_MINUTES * 60 * 1000);
      const twentyFourHoursAgo = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000);

      // ─── ۱. پرداخت‌های PENDING درگاهی ───
      const pendingPayments = await Payment.find({
        status: PaymentStatus.PENDING,
        paymentMethod: { $in: ['nikpal', 'zarinpal', 'wallet-topup'] },
        gatewayAuthority: { $exists: true, $ne: null },
        createdAt: { $lt: fiveMinAgo, $gt: twentyFourHoursAgo },
      }).limit(BATCH_SIZE);

      for (const payment of pendingPayments) {
        try {
          const gatewayStatus = await nikpalService.getPaymentStatus(
            payment.gatewayAuthority!,
          );

          if (gatewayStatus.status === 'PAID') {
            // ⚠️ طبق مستندات NikPal: Status فقط وضعیت ذخیره‌شده را می‌خواند؛
            // نتیجهٔ نهایی فقط با Verify قطعی می‌شود. Verify روی تراکنش
            // نهایی‌شده idempotent است (وضعیت ذخیره‌شده برمی‌گردد) → بی‌خطر.
            const verifyResult = await nikpalService.verifyPayment(
              payment.gatewayAuthority!,
            );
            if (verifyResult.status !== 'PAID') {
              // درگاه صریحاً verify را رد کرده → ردِ قطعی
              payment.status = PaymentStatus.FAILED;
              payment.failureReason = `Verify status: ${verifyResult.status}`;
              await payment.save();
              log('VERIFY_NOT_PAID', {
                paymentId: payment._id,
                orderNumber: payment.orderNumber,
                verifyStatus: verifyResult.status,
              });
              continue;
            }
            // ✅ Verify موفق — نهایی‌سازی (idempotent)
            // (اگر تراکنش DB شکست بخورد، finalize خودش PENDING را حفظ می‌کند
            //  و چرخه‌ی بعد دوباره تلاش می‌شود)
            log('PAID_AT_GATEWAY_FINALIZING', {
              paymentId: payment._id,
              orderNumber: payment.orderNumber,
              refId: verifyResult.referenceId || gatewayStatus.referenceId,
            });
            try {
              await finalizeGatewayPayment(
                payment,
                verifyResult.referenceId || gatewayStatus.referenceId,
                verifyResult.amount,
              );
            } catch (finalizeError) {
              // ✅ FIX H5: اختلاف مبلغ → FAILED قطعی (finalize خودش ثبت کرده)
              if (finalizeError instanceof GatewayAmountMismatchError) {
                log('AMOUNT_MISMATCH', {
                  paymentId: payment._id,
                  orderNumber: payment.orderNumber,
                  expectedToman: finalizeError.expectedToman,
                  actualRial: finalizeError.actualRial,
                });
              }
              // خطای موقت DB → PENDING می‌ماند؛ چرخه بعد دوباره تلاش می‌شود
              continue;
            }
            log('FINALIZED', {
              paymentId: payment._id,
              orderNumber: payment.orderNumber,
            });
          } else if (
            now - new Date(payment.createdAt).getTime() >
            EXPIRE_AFTER_MINUTES * 60 * 1000
          ) {
            // درگاه گفته پرداخت نشده + قدیمی‌تر از ۳۰ دقیقه → EXPIRE امن
            payment.status = PaymentStatus.EXPIRED;
            payment.failureReason = `پرداخت در مهلت مقرر انجام نشد (استعلام درگاه: ${gatewayStatus.status})`;
            await payment.save();
            log('EXPIRED', {
              paymentId: payment._id,
              orderNumber: payment.orderNumber,
              gatewayStatus: gatewayStatus.status,
            });
          }
          // در غیر این صورت: هنوز در درگاه در انتظار است → چرخه‌ی بعد
        } catch (error) {
          // درگاه در دسترس نیست (خطای شبکه/سرور) → رد کن؛ چرخه‌ی بعد دوباره
          log('PENDING_CHECK_FAILED', {
            paymentId: payment._id,
            orderNumber: payment.orderNumber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // ─── ۲. Step 4: پرداخت‌های FAILEDِ قابل‌بازیابی (خطای موقتِ verify قبلی) ───
      // کمتر از ۵ تلاش ناموفق + آخرین تلاش (یا ایجاد، برای رکوردهای قدیمیِ
      // بدون lastVerifyAttemptAt) در ۲۴ ساعت اخیر. اگر درگاه بگوید PAID → نهایی‌سازی.
      const failedPayments = await Payment.find({
        status: PaymentStatus.FAILED,
        paymentMethod: { $in: ['nikpal', 'zarinpal', 'wallet-topup'] },
        gatewayAuthority: { $exists: true, $ne: null },
        $and: [
          // $lt به فیلدِ غایب match نمی‌کند؛ با $not اسناد قدیمیِ بدون فیلد هم پوشش داده می‌شوند
          { verifyAttemptCount: { $not: { $gte: MAX_VERIFY_ATTEMPTS } } },
          {
            $or: [
              { lastVerifyAttemptAt: { $gte: twentyFourHoursAgo } },
              // رکوردهای قدیمیِ FAILED (پیش از فیکس پرامپت ۲) بدون lastVerifyAttemptAt
              { lastVerifyAttemptAt: null, createdAt: { $gte: twentyFourHoursAgo } },
            ],
          },
        ],
      }).limit(BATCH_SIZE);

      for (const payment of failedPayments) {
        try {
          const gatewayStatus = await nikpalService.getPaymentStatus(
            payment.gatewayAuthority!,
          );
          if (gatewayStatus.status === 'PAID') {
            // ⚠️ طبق مستندات NikPal: نتیجهٔ نهایی فقط با Verify است (نه Status)
            const verifyResult = await nikpalService.verifyPayment(
              payment.gatewayAuthority!,
            );
            if (verifyResult.status !== 'PAID') {
              payment.status = PaymentStatus.FAILED;
              payment.failureReason = `Verify status: ${verifyResult.status}`;
              await payment.save();
              log('FAILED_VERIFY_NOT_PAID', {
                paymentId: payment._id,
                orderNumber: payment.orderNumber,
                verifyStatus: verifyResult.status,
              });
              continue;
            }
            log('FAILED_BUT_PAID_FINALIZING', {
              paymentId: payment._id,
              orderNumber: payment.orderNumber,
              refId: verifyResult.referenceId || gatewayStatus.referenceId,
            });
            try {
              await finalizeGatewayPayment(
                payment,
                verifyResult.referenceId || gatewayStatus.referenceId,
                verifyResult.amount,
              );
            } catch (finalizeError) {
              if (finalizeError instanceof GatewayAmountMismatchError) {
                log('FAILED_AMOUNT_MISMATCH', {
                  paymentId: payment._id,
                  orderNumber: payment.orderNumber,
                  expectedToman: finalizeError.expectedToman,
                  actualRial: finalizeError.actualRial,
                });
              }
              continue;
            }
            log('FAILED_RESURRECTED', {
              paymentId: payment._id,
              orderNumber: payment.orderNumber,
            });
          }
          // درگاه گفته پرداخت نشده → FAILED بماند (دست نزن)
        } catch (error) {
          log('FAILED_CHECK_FAILED', {
            paymentId: payment._id,
            orderNumber: payment.orderNumber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (pendingPayments.length > 0 || failedPayments.length > 0) {
        log('CYCLE_DONE', {
          pendingChecked: pendingPayments.length,
          failedChecked: failedPayments.length,
        });
      }
    } catch (error) {
      // شکست کل چرخه (مثلاً قطعی دیتابیس) نباید job را بکشد
      console.error('[Reconciliation] Job failed:', error);
    }
  });

  log('CRON_STARTED', { schedule: '*/5 * * * *', batchSize: BATCH_SIZE });
}
