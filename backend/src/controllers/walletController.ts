/**
 * 👛 کنترلر کیف پول (کاربر عادی)
 *
 * GET  /api/v1/wallet              → خلاصه (موجودی + ۵ تراکنش آخر)
 * GET  /api/v1/wallet/transactions → صورت حساب (صفحه‌بندی + فیلتر type/reason)
 * POST /api/v1/wallet/topup        → شارژ از درگاه NikPal (paymentMethod='wallet-topup')
 * POST /api/v1/wallet/withdraw     → درخواست برداشت (کسر رزروی + ساخت درخواست در یک تراکنش)
 *
 * ⚠️ هر تغییر موجودی از طریق `walletService` انجام می‌شود و در دفتر کل
 * (WalletTransaction) ثبت می‌گردد — هیچ `$inc` مستقیمی در این فایل نیست.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment';
import WithdrawalRequest from '../models/WithdrawalRequest';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { PaymentStatus } from '../types';
import { walletService, InsufficientBalanceError } from '../services/wallet.service';
import { nikpalService, NikpalError } from '../services/nikpal.service';
import { nikpalConfig } from '../config/nikpal';
import { generateOrderNumber, paymentLog } from './paymentController';

// ==================== Constants ====================
/** حداقل مبلغ شارژ: ۱۰,۰۰۰ تومان */
const MIN_TOPUP_AMOUNT = 10000;
/** حداقل مبلغ برداشت: ۵۰,۰۰۰ تومان (همچنین در اسکیما min: 50000) */
const MIN_WITHDRAWAL_AMOUNT = 50000;
/** حداکثر درخواست برداشت در هر روز برای هر کاربر */
const MAX_WITHDRAWALS_PER_DAY = 5;
/** حداکثر درخواست برداشتِ همزمان در صف بررسی */
const MAX_PENDING_WITHDRAWALS = 3;
/** پنجره‌ی همزمانی: شارژ در انتظارِ جدید (دقیقه) */
const TOPUP_WINDOW_MINUTES = 15;

// ==================== 1. GET /wallet — خلاصه ====================
export const getWalletSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const summary = await walletService.getSummary(req.user._id);
  return ApiResponse.success(res, summary, 'خلاصه‌ی کیف پول');
});

// ==================== 2. GET /wallet/transactions — صورت حساب ====================
export const getWalletTransactions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const type = req.query.type as string | undefined;
  const reason = req.query.reason as string | undefined;

  if (type && !['credit', 'debit'].includes(type)) {
    throw ApiError.badRequest('فیلتر type فقط credit یا debit است');
  }

  const result = await walletService.getTransactions(req.user._id, page, limit, {
    type,
    reason,
  });
  return ApiResponse.paginated(
    res,
    result.transactions,
    page,
    limit,
    result.pagination.total,
    'صورت حساب کیف پول',
  );
});

// ==================== 3. POST /wallet/topup — شارژ از درگاه ====================
/**
 * شارژ کیف پول از درگاه NikPal:
 *  ۱. ساخت سند Payment با paymentMethod='wallet-topup' و items خالی (وضعیت PENDING)
 *  ۲. ایجاد پرداخت در درگاه و برگرداندن gatewayUrl به کلاینت
 *  ۳. نهایی‌سازی توسط همان جریان callback/verify/ job تطبیق →
 *     `finalizeGatewayPayment` برای این روش به‌جای صدور ثبت‌نام، کیف پول را
 *     با reason='topup' بستانکار می‌کند (سبد خرید هم دست نمی‌خورد).
 */
export const topupWallet = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (!nikpalConfig.isPaymentEnabled) {
    return ApiResponse.error(res, 'سیستم پرداخت موقتاً غیرفعال است', 503);
  }

  const userId = req.user._id;
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < MIN_TOPUP_AMOUNT) {
    throw ApiError.badRequest('حداقل مبلغ شارژ ۱۰,۰۰۰ تومان است');
  }

  // شارژِ در انتظارِ اخیر → همان را برگردان (جلوگیری از چند پرداخت همزمان)
  const windowStart = new Date(Date.now() - TOPUP_WINDOW_MINUTES * 60 * 1000);
  const existingPending = await Payment.findOne({
    user: userId,
    status: PaymentStatus.PENDING,
    paymentMethod: 'wallet-topup',
    createdAt: { $gte: windowStart },
  });

  if (existingPending?.gatewayAuthority) {
    paymentLog('TOPUP_CONCURRENT_RETURNED', {
      userId,
      paymentId: existingPending._id,
      amount: existingPending.finalAmount,
    });
    return ApiResponse.success(
      res,
      {
        paymentId: existingPending._id,
        orderNumber: existingPending.orderNumber,
        finalAmount: existingPending.finalAmount,
        gatewayUrl: nikpalService.getPaymentUrl(existingPending.gatewayAuthority),
      },
      'شما قبلاً درخواست شارژ داشته‌اید',
    );
  }
  if (existingPending) {
    existingPending.status = PaymentStatus.EXPIRED;
    existingPending.failureReason = 'درخواست شارژ جدید ایجاد شد';
    await existingPending.save();
  }

  const payment = await Payment.create({
    user: userId,
    orderNumber: generateOrderNumber(),
    // آیتم‌ها خالی — شارژ دوره نیست؛ سهم مدرس/کوپن/سبد در کار نیست
    items: [],
    totalAmount: amount,
    discountAmount: 0,
    finalAmount: amount,
    paymentMethod: 'wallet-topup',
    status: PaymentStatus.PENDING,
    metadata: { email: req.user.email },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  try {
    // 💱 قرارداد واحد پول: مبلغ شارژ به تومان به adapter؛ تبدیل ریال فقط داخل adapter
    const nikpalResult = await nikpalService.createPayment({
      amountToman: payment.finalAmount,
      orderId: payment.orderNumber,
      callbackUrl: nikpalConfig.callbackUrl,
    });

    payment.gatewayAuthority = nikpalResult.paymentId;
    await payment.save();

    paymentLog('TOPUP_REQUEST_SUCCESS', {
      userId,
      amount,
      paymentId: payment._id,
      gatewayPaymentId: nikpalResult.paymentId,
    });

    return ApiResponse.success(
      res,
      {
        paymentId: payment._id,
        orderNumber: payment.orderNumber,
        finalAmount: payment.finalAmount,
        gatewayUrl: nikpalResult.paymentUrl,
      },
      'درخواست شارژ ایجاد شد',
      201,
    );
  } catch (error) {
    payment.status = PaymentStatus.FAILED;
    payment.failureReason =
      error instanceof NikpalError
        ? `${error.message}${error.errorCode ? ` (کد: ${error.errorCode})` : ''}`
        : 'خطا در اتصال به درگاه پرداخت';
    await payment.save();

    paymentLog('TOPUP_REQUEST_FAILED', {
      userId,
      amount,
      paymentId: payment._id,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof NikpalError) {
      // 401/403 درگاه نباید به فرانت ۴۰۱ برگردد (interceptor آن را لاگاوت تفسیر می‌کند)
      const clientStatus =
        error.statusCode === 401 || error.statusCode === 403 ? 502 : error.statusCode;
      return ApiResponse.error(res, error.message, clientStatus);
    }
    return ApiResponse.error(res, 'خطا در اتصال به درگاه پرداخت', 500);
  }
});

// ==================== 4. POST /wallet/withdraw — درخواست برداشت ====================
/**
 * درخواست برداشت (حداقل ۵۰,۰۰۰ تومان):
 *  - حداکثر ۳ درخواستِ همزمان در صف + حداکثر ۵ درخواست در هر روز
 *  - مبلغ در «همان تراکنش» از کیف پول کسر (رزرو) و ساخت درخواست ثبت می‌شود؛
 *    یا هر دو انجام می‌شوند یا هیچ‌کدام (ضد race condition)
 *  - ردشدنِ بعدی درخواست توسط ادمین، خودکار پول را برمی‌گرداند
 */
export const requestWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const userId = req.user._id;

  const amount = Number(req.body?.amount);
  const bankInfo = req.body?.bankInfo;

  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < MIN_WITHDRAWAL_AMOUNT) {
    throw ApiError.badRequest('حداقل مبلغ برداشت ۵۰,۰۰۰ تومان است');
  }
  if (!bankInfo || typeof bankInfo !== 'object') {
    throw ApiError.badRequest('اطلاعات حساب بانکی (bankInfo) الزامی است');
  }
  if (!bankInfo.accountHolder || String(bankInfo.accountHolder).trim().length < 3) {
    throw ApiError.badRequest('نام صاحب حساب باید حداقل ۳ کاراکتر باشد');
  }
  if (bankInfo.shebaNumber && !/^IR\d{24}$/.test(String(bankInfo.shebaNumber))) {
    throw ApiError.badRequest('شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد');
  }
  if (bankInfo.cardNumber && !/^\d{16}$/.test(String(bankInfo.cardNumber))) {
    throw ApiError.badRequest('شماره کارت باید ۱۶ رقم باشد');
  }

  // سقف روزانه: ۵ درخواست در هر تقویم (از نیمه‌شب به وقت سرور)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await WithdrawalRequest.countDocuments({
    user: userId,
    createdAt: { $gte: startOfDay },
  });
  if (todayCount >= MAX_WITHDRAWALS_PER_DAY) {
    throw new ApiError(
      429,
      `سقف ${MAX_WITHDRAWALS_PER_DAY} درخواست برداشت در روز رعایت شده است؛ فردا دوباره تلاش کنید`,
    );
  }

  // سقف همزمان در صف بررسی
  const pendingCount = await WithdrawalRequest.countDocuments({
    user: userId,
    status: 'pending',
  });
  if (pendingCount >= MAX_PENDING_WITHDRAWALS) {
    throw ApiError.badRequest(
      `حداکثر ${MAX_PENDING_WITHDRAWALS} درخواست برداشت در انتظار بررسی مجاز است`,
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // ۱+۳. کسر اتمیک موجودی (شرط balance >= amount داخل سرویس) + رکورد دفتر کل
      try {
        await walletService.debit(userId, amount, {
          reason: 'withdrawal',
          description: 'رزرو مبلغ برداشت',
          session,
        });
      } catch (err) {
        if (err instanceof InsufficientBalanceError) {
          throw ApiError.badRequest('موجودی کیف پول کافی نیست');
        }
        throw err;
      }

      // ۲+۴. ساخت درخواست (در همان تراکنش)
      await WithdrawalRequest.create(
        [
          {
            user: userId,
            amount,
            bankInfo: {
              shebaNumber: bankInfo.shebaNumber || undefined,
              cardNumber: bankInfo.cardNumber || undefined,
              accountHolder: String(bankInfo.accountHolder).trim(),
            },
          },
        ],
        { session },
      );
    });

    paymentLog('WITHDRAWAL_REQUESTED', { userId, amount });
    return ApiResponse.created(res, { amount }, 'درخواست برداشت ثبت شد');
  } finally {
    await session.endSession();
  }
});
