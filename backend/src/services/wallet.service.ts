/**
 * 💰 سرویس کیف پول — تنها نقطه‌ی معتبرِ تغییر موجودی
 *
 * ⚠️ FIX CRITICAL (فاز ۲ از رودمپ مالی — دفتر کل):
 * پیش‌ز این، موجودی با `$inc` مستقیم روی User در ۴+ نقطه تغییر می‌کرد؛
 * هیچ تاریخچه‌ای ذخیره نمی‌شد و امکان راستی‌آزمایی/ممیزی وجود نداشت.
 * حالا هر عملیات `credit`/`debit`:
 *   ۱. تغییر موجودی را به‌صورت اتمیک اعمال می‌کند (ضد double-spend با شرط `$gte`)
 *   ۲. یک رکورد `WalletTransaction` (دفتر کل) با `balanceAfter` ثبت می‌کند
 *   ۳. پارامتر `session` را عبور می‌دهد تا داخل تراکنش‌های پرداخت اجرا شود
 *
 * شارژ (topup) و برداشت (withdrawal) در فازهای بعدی از همین سرویس استفاده می‌کنند.
 * `totalWithdrawn` طبق نقشه‌ی راه فعلاً دست‌نخورده می‌ماند.
 */

import mongoose, { ClientSession } from 'mongoose';
import User from '../models/User';
import WalletTransaction from '../models/WalletTransaction';
import type { WalletTransactionReason } from '../models/WalletTransaction';

// ==================== Types ====================

export type WalletId = string | mongoose.Types.ObjectId;

export interface WalletOperationOptions {
  reason: WalletTransactionReason;
  description?: string;
  relatedPayment?: WalletId;
  relatedCourse?: WalletId;
  relatedWithdrawal?: WalletId;
  createdBy?: WalletId;
  session?: ClientSession;
  /**
   * شمارنده‌ی فرعی که با این عملیات به‌روز می‌شود:
   *  - credit: پیش‌فرض `totalDeposited` (واریز)؛ برای بازگشت وجه از `totalSpent` استفاده شود
   *  - debit: پیش‌فرض `totalSpent` (خرید)؛ برای کسر سهم مدرس از `totalDeposited` استفاده شود
   */
  secondaryCounter?: 'totalDeposited' | 'totalSpent' | 'none';
  /**
   * `instructorProfile.totalEarnings` هم به همان جهت تغییر کند
   * (فقط برای سهم مدرس — خرید/بازگشت دانشجو نباید به آن دست بزند)
   */
  deltaInstructorEarnings?: boolean;
  /**
   * اجازه‌ی موجودی منفی (بدهی) — فقط برای کسر سهم مدرس هنگام بازپرداخت:
   * رکوردهای قدیمی هرگز واریز نشده‌اند و موجودی مدرس ممکن است صفر باشد؛
   * بازپرداخت نباید به خاطر آن شکست بخورد (بدهی تا تسویه‌ی آینده).
   */
  allowNegative?: boolean;
}

/** خطای موجودی ناکافی — کنترلرها می‌توانند با instanceof آن را به 400 تبدیل کنند */
export class InsufficientBalanceError extends Error {
  constructor(message = 'موجودی کیف پول کافی نیست') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

// ==================== Service ====================

class WalletService {
  /**
   * افزایش موجودی + ثبت در دفتر کل (اتمیک با session).
   * مثال‌ها: سهم مدرس (instructor_share)، بازگشت وجه (refund)، شارژ (topup)
   */
  async credit(
    userId: WalletId,
    amount: number,
    options: WalletOperationOptions,
  ): Promise<{ balance: number; totalDeposited: number; totalWithdrawn: number; totalSpent?: number }> {
    if (amount <= 0) throw new Error('Credit amount must be positive');

    const counter = options.secondaryCounter ?? 'totalDeposited';
    const inc: Record<string, number> = { 'wallet.balance': amount };

    if (counter === 'totalDeposited') {
      inc['wallet.totalDeposited'] = amount;
    } else if (counter === 'totalSpent') {
      // بازگشت وجه ← خرجِ ثبت‌شده کم می‌شود (نه واریز)
      inc['wallet.totalSpent'] = -amount;
    }
    if (options.deltaInstructorEarnings) {
      inc['instructorProfile.totalEarnings'] = amount;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: inc },
      { new: true, session: options.session },
    );
    if (!user) throw new Error('User not found');

    await WalletTransaction.create(
      [
        {
          user: userId,
          type: 'credit',
          amount,
          balanceAfter: user.wallet.balance,
          reason: options.reason,
          description: options.description,
          relatedPayment: options.relatedPayment,
          relatedCourse: options.relatedCourse,
          relatedWithdrawal: options.relatedWithdrawal,
          createdBy: options.createdBy,
        },
      ],
      { session: options.session },
    );

    return user.wallet;
  }

  /**
   * کاهش موجودی + ثبت در دفتر کل (اتمیک).
   * به‌صورت پیش‌فرض شرط `balance >= amount` داخل خودِ کوئری است (ضد double-spend)؛
   * فقط با `allowNegative` (کسر سهم مدرس در بازپرداخت) این شرط برداشته می‌شود.
   */
  async debit(
    userId: WalletId,
    amount: number,
    options: WalletOperationOptions,
  ): Promise<{ balance: number; totalDeposited: number; totalWithdrawn: number; totalSpent?: number }> {
    if (amount <= 0) throw new Error('Debit amount must be positive');

    const counter = options.secondaryCounter ?? 'totalSpent';
    const inc: Record<string, number> = { 'wallet.balance': -amount };

    if (counter === 'totalSpent') {
      inc['wallet.totalSpent'] = amount;
    } else if (counter === 'totalDeposited') {
      // کسر واریزی (بازپرداخت سهم مدرس) — از totalDeposited کم می‌شود
      inc['wallet.totalDeposited'] = -amount;
    }
    if (options.deltaInstructorEarnings) {
      inc['instructorProfile.totalEarnings'] = -amount;
    }

    const filter: Record<string, any> = { _id: userId };
    if (!options.allowNegative) {
      // 🔒 کسر اتمیک با شرط — درخواست‌های همزمان هرگز موجودی را منفی نمی‌کنند
      filter['wallet.balance'] = { $gte: amount };
    }

    const user = await User.findOneAndUpdate(
      filter,
      { $inc: inc },
      { new: true, session: options.session },
    );
    if (!user) {
      if (options.allowNegative) throw new Error('User not found');
      throw new InsufficientBalanceError();
    }

    await WalletTransaction.create(
      [
        {
          user: userId,
          type: 'debit',
          amount,
          balanceAfter: user.wallet.balance,
          reason: options.reason,
          description: options.description,
          relatedPayment: options.relatedPayment,
          relatedCourse: options.relatedCourse,
          relatedWithdrawal: options.relatedWithdrawal,
          createdBy: options.createdBy,
        },
      ],
      { session: options.session },
    );

    return user.wallet;
  }

  /** موجودی فعلی کاربر */
  async getBalance(userId: WalletId) {
    const user = await User.findById(userId).select('wallet');
    return (
      user?.wallet || {
        balance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        totalSpent: 0,
      }
    );
  }

  /** صورت حساب (تاریخچه‌ی تراکنش‌ها با صفحه‌بندی و فیلتر) */
  async getTransactions(
    userId: WalletId,
    page = 1,
    limit = 20,
    filters?: { type?: string; reason?: string },
  ) {
    const query: Record<string, any> = { user: userId };
    if (filters?.type) query.type = filters.type;
    if (filters?.reason) query.reason = filters.reason;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('relatedPayment', 'orderNumber finalAmount')
        .populate('relatedCourse', 'title')
        .lean(),
      WalletTransaction.countDocuments(query),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /** خلاصه‌ی کیف پول + ۵ تراکنش آخر (برای صفحه‌ی کیف پول) */
  async getSummary(userId: WalletId) {
    const user = await User.findById(userId).select('wallet');
    const recentTransactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    return {
      wallet: user?.wallet,
      recentTransactions,
    };
  }
}

export const walletService = new WalletService();
export default walletService;
