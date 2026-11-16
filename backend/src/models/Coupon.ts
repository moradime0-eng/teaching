import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface ICoupon extends Document {
  _id: mongoose.Types.ObjectId;
  code: string;
  description?: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  minPurchase?: number;

  applicableCourses?: mongoose.Types.ObjectId[];
  applicableCategories?: mongoose.Types.ObjectId[];
  excludedCourses?: mongoose.Types.ObjectId[];

  usageLimit?: number;
  usedCount: number;
  usageLimitPerUser: number;
  usedBy: {
    user: mongoose.Types.ObjectId;
    usedAt: Date;
    payment: mongoose.Types.ObjectId;
  }[];

  validFrom: Date;
  validUntil: Date;

  isActive: boolean;
  isFirstPurchaseOnly: boolean;

  createdBy: mongoose.Types.ObjectId;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, maxlength: 300 },

    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    maxDiscount: { type: Number, min: 0 },
    minPurchase: { type: Number, min: 0 },

    applicableCourses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    applicableCategories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    excludedCourses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],

    usageLimit: { type: Number, min: 0 },
    usedCount: { type: Number, default: 0 },
    usageLimitPerUser: { type: Number, default: 1 },
    usedBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        usedAt: { type: Date, default: Date.now },
        payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
      },
    ],

    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },

    isActive: { type: Boolean, default: true },
    isFirstPurchaseOnly: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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

couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ validUntil: 1 });
// Tenant-scoped indexes
couponSchema.index({ tenant: 1, code: 1 }, { unique: true });
couponSchema.index({ tenant: 1, isActive: 1, validUntil: 1 });
couponSchema.index({ tenant: 1, createdBy: 1 });
// Apply tenant isolation plugin
couponSchema.plugin(tenantPlugin);

const Coupon: Model<ICoupon> = mongoose.model<ICoupon>('Coupon', couponSchema);
export default Coupon;


