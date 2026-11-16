/**
 * 🏦 مدل درخواست برداشت وجه (Withdrawal Request)
 *
 * مدرس پس از جمع‌شدن درآمد در کیف پول، درخواست برداشت ثبت می‌کند؛
 * مبلغ **لحظه‌ی ثبت** از کیف پول کسر (رزرو) می‌شود تا همزمان دو درخواست
 * مضاعف نسازد. سرنوشت درخواست:
 *  - pending  → در صف بررسی ادمین (پول رزروشده)
 *  - approved → تأیید شده؛ ادمین واقعاً پرداخت را انجام می‌دهد
 *  - paid     → پرداخت انجام شد (کد رهگیری ثبت می‌شود) — پول قطعاً رفته
 *  - rejected → رد شد → سرویس ادمین «خودکار» مبلغ را به کیف پول برمی‌گرداند
 *
 * ⚠️ نکته: برداشتِ ردشده با reason='rollback' و secondaryCounter='none'
 * برمی‌گردد تا شمارنده‌های totalDeposited/totalSpent دستکاری نشوند.
 */

import mongoose, { Schema, Document } from 'mongoose';

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface IWithdrawalRequest extends Document {
  user: mongoose.Types.ObjectId;
  amount: number;
  status: WithdrawalStatus;
  bankInfo: {
    shebaNumber?: string;
    cardNumber?: string;
    accountHolder: string;
  };
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  paidAt?: Date;
  rejectionReason?: string;
  trackingCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const withdrawalSchema = new Schema<IWithdrawalRequest>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // حداقل مبلغ برداشت: ۵۰,۰۰۰ تومان
    amount: { type: Number, required: true, min: 50000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
      index: true,
    },
    bankInfo: {
      shebaNumber: { type: String, match: /^IR\d{24}$/ },
      cardNumber: { type: String, match: /^\d{16}$/ },
      accountHolder: {
        type: String,
        required: [true, 'نام صاحب حساب الزامی است'],
        minlength: 3,
      },
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    paidAt: { type: Date },
    rejectionReason: { type: String },
    trackingCode: { type: String },
  },
  { timestamps: true },
);

// ایندکس‌های پنل ادمین و لیست کاربر
withdrawalSchema.index({ status: 1, createdAt: -1 });
withdrawalSchema.index({ user: 1, createdAt: -1 });

const WithdrawalRequest = mongoose.model<IWithdrawalRequest>(
  'WithdrawalRequest',
  withdrawalSchema,
);
export default WithdrawalRequest;
