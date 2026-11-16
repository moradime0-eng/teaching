import mongoose, { Schema, Document, Model } from 'mongoose';
import { PaymentStatus } from '../types';
import { tenantPlugin } from '../plugins/tenantPlugin';

interface IPaymentItem {
  course: mongoose.Types.ObjectId;
  price: number;
  /** قیمت این آیتم بعد از اعمال تخفیف — مبنای سهم مدرس/پلتفرم و Enrollment.pricePaid */
  adjustedPrice?: number;
  instructorShare: number;
  platformShare: number;
}

export interface IPayment extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  orderNumber: string;
  items: IPaymentItem[];

  totalAmount: number;
  discountAmount: number;
  finalAmount: number;

  coupon?: mongoose.Types.ObjectId;
  /** کمپین تخفیف سراسری که روی این پرداخت اعمال شده (برای گزارش‌گیری و اتریبیوشن) */
  campaign?: mongoose.Types.ObjectId;

  paymentMethod: 'nikpal' | 'zarinpal' | 'wallet' | 'free' | 'wallet-topup';

  status: PaymentStatus;
  transactionId?: string;
  /** شناسه پرداخت نکپال (NikPal paymentId) — برای رکوردهای قدیمی zarinpal authority */
  gatewayAuthority?: string;
  gatewayRefId?: string;
  gatewayResponse?: object;
  paidAt?: Date;

  // فیلدهای درگاه پرداخت
  cardPan?: string;
  cardHash?: string;
  fee?: number;
  feeType?: string;
  callbackStatus?: string; // مقدار Status برگشتی از درگاه: PAID/FAILED/CANCELED
  verifiedAt?: Date;
  reversedAt?: Date;
  failureReason?: string;
  // ⚠️ FIX CRITICAL: فیلدهای بازیابی verify — خطای موقتِ درگاه نباید پرداخت را برای همیشه FAILED کند
  /** آخرین خطای verify/استعلام (برای عیب‌یابی و تصمیم بازیابی) */
  lastVerifyError?: string;
  /** تعداد تلاش‌های verify که با خطا مواجه شده‌اند */
  verifyAttemptCount?: number;
  /** زمان آخرین تلاش verify */
  lastVerifyAttemptAt?: Date;
  metadata?: {
    mobile?: string;
    email?: string;
    orderId?: string;
  };

  isRefunded: boolean;
  refundedAt?: Date;
  refundAmount?: number;
  refundReason?: string;
  /** ادمین اجراکننده‌ی بازپرداخت — FIX: هویت اجراکننده قبلاً فقط در کنسول لاگ می‌شد */
  refundedBy?: mongoose.Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    items: [
      {
        course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
        price: { type: Number, required: true, min: 0 },
        // ⚠️ FIX CRITICAL: قیمت بعد از تخفیف — مبنای سهم مدرس/پلتفرم و pricePaid.
        // برای سازگاری با رکوردهای قدیمی (بدون این فیلد) اختیاری است؛ در کد
        // به price fallback می‌شود. عمداً required نیست تا re-save اسناد قدیمی
        // (مثلاً verify پرداخت‌های PENDING قدیمی) ValidationError نگیرد.
        adjustedPrice: { type: Number, min: 0 },
        instructorShare: { type: Number, required: true, min: 0 },
        platformShare: { type: Number, required: true, min: 0 },
      },
    ],

    totalAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },

    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    /** کمپین تخفیف سراسری که روی این پرداخت اعمال شده (برای گزارش‌گیری و اتریبیوشن) */
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign' },

    paymentMethod: {
      type: String,
      // 'nikpal': درگاه جدید | 'zarinpal': رکوردهای قدیمی | 'wallet'/'free': داخلی
      // 'wallet-topup': شارژ کیف پول از درگاه (پول کاربر — درآمد پلتفرم نیست)
      enum: ['nikpal', 'zarinpal', 'wallet', 'free', 'wallet-topup'],
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    transactionId: { type: String },
    gatewayAuthority: { type: String, index: true },
    gatewayRefId: { type: String },
    gatewayResponse: { type: Schema.Types.Mixed },

    paidAt: { type: Date },

    // فیلدهای درگاه پرداخت
    cardPan: { type: String },
    cardHash: { type: String },
    fee: { type: Number },
    feeType: { type: String },
    callbackStatus: { type: String },
    verifiedAt: { type: Date },
    reversedAt: { type: Date },
    failureReason: { type: String },
    // ⚠️ فیلدهای بازیابی verify — قبلاً فقط در interface بودند و schema آن‌ها را
    // ذخیره نمی‌کرد (MongoDB strict → حذف بی‌صدا)؛ مکانیزم بازیابی عملاً کور بود
    lastVerifyError: { type: String },
    verifyAttemptCount: { type: Number, default: 0 },
    lastVerifyAttemptAt: { type: Date },
    metadata: {
      mobile: { type: String },
      email: { type: String },
      orderId: { type: String },
    },

    isRefunded: { type: Boolean, default: false },
    refundedAt: { type: Date },
    refundAmount: { type: Number },
    refundReason: { type: String },
    // ادمین اجراکننده‌ی بازپرداخت (توسط refundService ست می‌شود)
    refundedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    ipAddress: { type: String },
    userAgent: { type: String },
    // Multi-tenancy
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
// ایندکس برای بررسی concurrent payment guard
paymentSchema.index({ user: 1, status: 1, createdAt: -1 });
// Tenant-scoped indexes
paymentSchema.index({ tenant: 1, user: 1, createdAt: -1 });
paymentSchema.index({ tenant: 1, status: 1, createdAt: -1 });
paymentSchema.index({ tenant: 1, orderNumber: 1 }, { unique: true });
// Apply tenant isolation plugin
paymentSchema.plugin(tenantPlugin);

const Payment: Model<IPayment> = mongoose.model<IPayment>('Payment', paymentSchema);
export default Payment;
