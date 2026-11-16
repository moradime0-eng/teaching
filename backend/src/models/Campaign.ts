import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

/**
 * 🎨 Campaign Theme Enum
 * Each theme maps to a distinct gradient/glow color scheme in the frontend.
 * NO image upload in v1 — purely CSS-driven.
 */
export type CampaignTheme = 'fire' | 'cold' | 'gold' | 'green';

/**
 * 🎯 Campaign Scope Enum
 * 'all' = applies to all courses (minus excludedCourses)
 * 'categories' = applies only to courses in the listed categories
 */
export type CampaignScope = 'all' | 'categories';

/**
 * 💰 Discount Type Enum
 * Matches Coupon semantics for consistency.
 */
export type CampaignDiscountType = 'percentage' | 'fixed';

/**
 * 🎨 Custom banner colors (optional)
 *
 * When present, these override the CSS theme (`fire`/`cold`/`gold`/`green`)
 * so admins can pick their own palette or build a custom gradient.
 */
export interface ICampaignColors {
  /** Solid background color (hex). Used when `gradient` is empty. */
  background?: string;
  /** Gradient stops (2–4 hex colors). When non-empty, the banner uses a gradient. */
  gradient?: string[];
  /** Gradient angle in degrees (0–360). */
  gradientAngle?: number;
}

export interface ICampaign extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  bannerText: string;
  startAt: Date;
  endAt: Date;
  discountType: CampaignDiscountType;
  discountValue: number; // Stored in Toman (for fixed) or percentage (1-100)
  maxDiscount?: number; // Optional cap for percentage campaigns (in Toman)
  scope: CampaignScope;
  categories: mongoose.Types.ObjectId[]; // Used when scope === 'categories'
  excludedCourses: mongoose.Types.ObjectId[]; // Escape hatch, mirrors Coupon
  theme: CampaignTheme;
  /** 🎨 Custom banner colors (overrides the CSS theme when present) */
  colors?: ICampaignColors;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  // Multi-tenancy: optional, follows existing convention (tenantPlugin is currently disabled)
  tenant?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaign>(
  {
    title: {
      type: String,
      required: [true, 'عنوان کمپین الزامی است'],
      trim: true,
      maxlength: [100, 'عنوان حداکثر 100 کاراکتر می‌تواند باشد'],
    },
    bannerText: {
      type: String,
      required: [true, 'متن بنر الزامی است'],
      trim: true,
      maxlength: [300, 'متن بنر حداکثر 300 کاراکتر می‌تواند باشد'],
    },
    startAt: {
      type: Date,
      required: [true, 'تاریخ شروع الزامی است'],
    },
    endAt: {
      type: Date,
      required: [true, 'تاریخ پایان الزامی است'],
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'نوع تخفیف الزامی است'],
    },
    discountValue: {
      type: Number,
      required: [true, 'مقدار تخفیف الزامی است'],
      min: [0, 'مقدار تخفیف نمی‌تواند منفی باشد'],
    },
    maxDiscount: {
      type: Number,
      min: [0, 'حداکثر تخفیف نمی‌تواند منفی باشد'],
    },
    scope: {
      type: String,
      enum: ['all', 'categories'],
      required: [true, 'محدوده کمپین الزامی است'],
      default: 'all',
    },
    categories: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    excludedCourses: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Course',
      },
    ],
    theme: {
      type: String,
      enum: ['fire', 'cold', 'gold', 'green'],
      required: [true, 'تم کمپین الزامی است'],
      default: 'fire',
    },
    /**
     * 🎨 Custom banner colors — overrides the CSS theme when present.
     * Optional: campaigns without it keep using the built-in themes.
     */
    colors: {
      type: new Schema<ICampaignColors>(
        {
          background: {
            type: String,
            trim: true,
            match: [
              /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
              'رنگ پس‌زمینه باید کد هگز معتبر باشد (مثال: #b93818)',
            ],
          },
          gradient: {
            type: [String],
            validate: {
              validator: (arr: string[]) =>
                !Array.isArray(arr) ||
                (arr.length >= 2 &&
                  arr.length <= 4 &&
                  arr.every((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c))),
              message: 'گرادیان باید بین 2 تا 4 رنگ هگز معتبر داشته باشد',
            },
          },
          gradientAngle: {
            type: Number,
            min: [0, 'زاویه گرادیان نمی‌تواند منفی باشد'],
            max: [360, 'زاویه گرادیان نمی‌تواند بیشتر از 360 درجه باشد'],
            default: 120,
          },
        },
        { _id: false },
      ),
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Multi-tenancy: optional field, follows existing convention
    // tenantPlugin is currently disabled (MULTI_TENANT_ENABLED=false)
    // When enabled, this field will be used for tenant isolation
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: false,
      index: true,
    },
  },
  { timestamps: true },
);

// Indexes for efficient querying
campaignSchema.index({ isActive: 1, startAt: 1, endAt: 1 });
campaignSchema.index({ tenant: 1, isActive: 1 });

// Pre-save validation
campaignSchema.pre('validate', function (next) {
  // endAt must be after startAt
  if (this.endAt <= this.startAt) {
    return next(new Error('تاریخ پایان باید بعد از تاریخ شروع باشد'));
  }

  // If scope is 'categories', categories array must not be empty
  if (this.scope === 'categories' && (!this.categories || this.categories.length === 0)) {
    return next(new Error('برای محدوده دسته‌بندی، حداقل یک دسته‌بندی انتخاب کنید'));
  }

  // Percentage discount must be 1-100
  if (this.discountType === 'percentage' && (this.discountValue < 1 || this.discountValue > 100)) {
    return next(new Error('درصد تخفیف باید بین 1 تا 100 باشد'));
  }

  // Fixed discount must be positive
  if (this.discountType === 'fixed' && this.discountValue <= 0) {
    return next(new Error('مبلغ تخفیف ثابت باید بزرگتر از صفر باشد'));
  }

  next();
});

// Apply tenant plugin (currently no-op, but keeps convention)
campaignSchema.plugin(tenantPlugin);

const Campaign: Model<ICampaign> = mongoose.model<ICampaign>('Campaign', campaignSchema);
export default Campaign;
