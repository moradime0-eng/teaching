/**
 * 📒 مدل دفتر کل کیف پول (Wallet Transaction Ledger)
 *
 * هر تغییرِ موجودیِ کیف پول (اعمال‌شده توسط `WalletService`) یک رکورد غیرقابل
 * تغییر در این جدول ثبت می‌کند:
 *  - `balanceAfter`: موجودی بعد از این عملیات → راستی‌آزمایی با جمع تراکنش‌ها
 *  - امکان ساخت «صورت حساب» کاربر و ممیزی تقلب
 *
 * ⚠️ نکته: `balanceAfter` عمداً `min: 0` ندارد — کسر سهم مدرس در بازپرداخت
 * (با `allowNegative`) ممکن است موجودی را منفی (بدهی) کند تا طراحی تسویه‌ی
 * آینده آن را وصول نماید؛ دفتر کل باید واقعیت را دقیقاً ثبت کند.
 * (ولیدیشن `min:0` روی مدل User هم با عملیات `$inc` اصلاً اجرا نمی‌شود.)
 */

import mongoose, { Schema, Document } from 'mongoose';

export type WalletTransactionType = 'credit' | 'debit';

export type WalletTransactionReason =
  | 'instructor_share'
  | 'purchase'
  | 'topup'
  | 'refund'
  | 'withdrawal'
  | 'admin_adjust'
  | 'rollback';

export interface IWalletTransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  reason: WalletTransactionReason;
  description?: string;
  relatedPayment?: mongoose.Types.ObjectId;
  relatedCourse?: mongoose.Types.ObjectId;
  relatedWithdrawal?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: { type: Number, required: true, min: 1 },
    // بدون min:0 — نگاه کنید به توضیحات فایل (بدهی مدرس ممکن است منفی شود)
    balanceAfter: { type: Number, required: true },
    reason: {
      type: String,
      enum: [
        'instructor_share',
        'purchase',
        'topup',
        'refund',
        'withdrawal',
        'admin_adjust',
        'rollback',
      ],
      required: true,
    },
    description: { type: String, maxlength: 500 },
    relatedPayment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    relatedCourse: { type: Schema.Types.ObjectId, ref: 'Course' },
    relatedWithdrawal: { type: Schema.Types.ObjectId, ref: 'WithdrawalRequest' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  // فقط createdAt — رکوردهای دفتر کل append-only هستند
  { timestamps: { createdAt: true, updatedAt: false } },
);

// ایندکس‌های ترکیبی برای صورت حساب کاربر
walletTransactionSchema.index({ user: 1, createdAt: -1 });
walletTransactionSchema.index({ user: 1, type: 1, createdAt: -1 });

const WalletTransaction = mongoose.model<IWalletTransaction>(
  'WalletTransaction',
  walletTransactionSchema,
);
export default WalletTransaction;
