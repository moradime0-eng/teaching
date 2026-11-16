/**
 * 🛡️ کنترلر ادمین مدیریت کیف پول‌ها و برداشت‌ها
 *
 * GET  /api/v1/wallet/admin/withdrawals              → لیست درخواست‌ها (صفحه‌بندی + فیلتر)
 * POST /api/v1/wallet/admin/withdrawals/:id/approve  → تأیید (پرداخت دستی توسط ادمین)
 * POST /api/v1/wallet/admin/withdrawals/:id/reject   → رد + «بازگشت خودکار» پول به کیف پول
 * POST /api/v1/wallet/admin/withdrawals/:id/paid     → ثبت پرداخت‌شده + کد رهگیری
 * POST /api/v1/wallet/admin/wallet/adjust            → اصلاح دستی موجودی (با ثبت در دفتر کل)
 *
 * همه‌ی تغییرات از طریق `walletService` → رکورد `WalletTransaction` با `createdBy=ادمین`.
 */

import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WithdrawalRequest from '../models/WithdrawalRequest';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { walletService, InsufficientBalanceError } from '../services/wallet.service';
import { paymentLog } from './paymentController';

// ==================== 1. لیست درخواست‌های برداشت ====================
export const listWithdrawals = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip, sort } = getPaginationOptions(req);

  const filter: Record<string, any> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.userId) filter.user = req.query.userId;

  const withdrawals = await WithdrawalRequest.find(filter)
    .populate('user', 'fullName email avatar role')
    .populate('reviewedBy', 'fullName')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await WithdrawalRequest.countDocuments(filter);
  return ApiResponse.paginated(
    res,
    withdrawals,
    page,
    limit,
    total,
    'لیست درخواست‌های برداشت',
  );
});

// ==================== 2. تأیید درخواست ====================
export const approveWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;

  const withdrawal = await WithdrawalRequest.findById(id);
  if (!withdrawal) throw ApiError.notFound('درخواست برداشت یافت نشد');
  if (withdrawal.status !== 'pending') {
    throw ApiError.badRequest(`فقط درخواست‌های در انتظار قابل تأیید هستند (وضعیت: ${withdrawal.status})`);
  }

  withdrawal.status = 'approved';
  withdrawal.reviewedBy = req.user._id;
  withdrawal.reviewedAt = new Date();
  await withdrawal.save();

  paymentLog('WITHDRAWAL_APPROVED', {
    withdrawalId: withdrawal._id,
    user: withdrawal.user,
    amount: withdrawal.amount,
    adminId: req.user._id,
  });

  return ApiResponse.success(res, withdrawal, 'درخواست برداشت تأیید شد');
});

// ==================== 3. رد درخواست + بازگشت خودکار پول ====================
export const rejectWithdrawal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    throw ApiError.badRequest('دلیل رد درخواست الزامی است (حداقل ۳ کاراکتر)');
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const withdrawal = await WithdrawalRequest.findById(id).session(session);
      if (!withdrawal) throw ApiError.notFound('درخواست برداشت یافت نشد');
      if (withdrawal.status !== 'pending') {
        throw ApiError.badRequest(`فقط درخواست‌های در انتظار قابل رد هستند (وضعیت: ${withdrawal.status})`);
      }

      withdrawal.status = 'rejected';
      withdrawal.rejectionReason = reason.trim();
      withdrawal.reviewedBy = req.user!._id;
      withdrawal.reviewedAt = new Date();
      await withdrawal.save({ session });

      // ✅ بازگشت خودکار پولِ رزروشده به کیف پول (در همان تراکنش)
      // secondaryCounter='none': پول قبلاً هنگام درخواست debit شده؛ فقط balance
      // برمی‌گردد تا totalDeposited/totalSpent دستکاری نشوند.
      await walletService.credit(withdrawal.user, withdrawal.amount, {
        reason: 'rollback',
        description: `بازگشت وجه برداشتِ ردشده: ${reason.trim()}`,
        secondaryCounter: 'none',
        relatedWithdrawal: withdrawal._id,
        createdBy: req.user!._id,
        session,
      });
    });

    paymentLog('WITHDRAWAL_REJECTED', {
      withdrawalId: id,
      adminId: req.user._id,
      reason,
    });

    return ApiResponse.success(res, { withdrawalId: id }, 'درخواست رد شد؛ مبلغ به کیف پول برگشت');
  } finally {
    await session.endSession();
  }
});

// ==================== 4. ثبت پرداخت‌شده + کد رهگیری ====================
export const markPaid = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params;
  const { trackingCode } = req.body;

  if (!trackingCode || typeof trackingCode !== 'string' || trackingCode.trim().length < 4) {
    throw ApiError.badRequest('کد رهگیری پرداخت الزامی است (حداقل ۴ کاراکتر)');
  }

  const withdrawal = await WithdrawalRequest.findById(id);
  if (!withdrawal) throw ApiError.notFound('درخواست برداشت یافت نشد');
  if (withdrawal.status !== 'approved') {
    throw ApiError.badRequest(
      `فقط درخواست‌های تأییدشده قابل ثبت پرداخت هستند (وضعیت: ${withdrawal.status})`,
    );
  }

  withdrawal.status = 'paid';
  withdrawal.trackingCode = trackingCode.trim();
  withdrawal.paidAt = new Date();
  withdrawal.reviewedBy = req.user._id;
  await withdrawal.save();

  paymentLog('WITHDRAWAL_PAID', {
    withdrawalId: withdrawal._id,
    user: withdrawal.user,
    amount: withdrawal.amount,
    trackingCode: withdrawal.trackingCode,
    adminId: req.user._id,
  });

  return ApiResponse.success(res, withdrawal, 'پرداخت برداشت ثبت شد');
});

// ==================== 5. اصلاح دستی موجودی کیف پول ====================
/**
 * بدنه: { userId, amount, direction: 'credit'|'debit', description? }
 * هر اصلاحی در دفتر کل با reason='admin_adjust' و createdBy=ادمین ثبت می‌شود.
 */
export const adjustBalance = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { userId, amount, direction, description } = req.body as Record<string, any>;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest('شناسه کاربر (userId) معتبر نیست');
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw ApiError.badRequest('مبلغ اصلاح باید عدد صحیح مثبت باشد');
  }
  if (direction !== 'credit' && direction !== 'debit') {
    throw ApiError.badRequest('direction فقط credit یا debit است');
  }
  if (direction === 'debit' && value > 1000000000) {
    throw ApiError.badRequest('سقف اصلاح منفی ۱,۰۰۰,۰۰۰,۰۰۰ تومان است');
  }

  const options = {
    reason: 'admin_adjust' as const,
    description:
      (typeof description === 'string' && description.trim()) || 'اصلاح دستی توسط ادمین',
    createdBy: req.user._id,
  };

  try {
    const wallet =
      direction === 'credit'
        ? await walletService.credit(userId, value, options)
        : await walletService.debit(userId, value, options);

    paymentLog('WALLET_ADJUSTED', {
      userId,
      direction,
      amount: value,
      adminId: req.user._id,
      balanceAfter: wallet.balance,
    });

    return ApiResponse.success(res, { userId, direction, amount: value, wallet }, 'موجودی اصلاح شد');
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      throw ApiError.badRequest('موجودی کاربر برای کسر این مبلغ کافی نیست');
    }
    throw error;
  }
});
