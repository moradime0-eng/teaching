import mongoose, { Schema, Document, Model } from 'mongoose';
import { CourseStatus, CourseLevel } from '../types';
import { PromoVideoType } from '../enums/LectureType';
import { tenantPlugin } from '../plugins/tenantPlugin';
import { DiscountType, ICountdownDiscount } from '../services/pricing.service';

export interface ICourse extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  subtitle?: string;
  description: string;
  shortDescription?: string;
  thumbnail: string;
  promoVideo?: string;
  promoVideoType?: PromoVideoType;
  promoVideoUrl?: string;
  promoVideoKey?: string;
  promoVideoBucket?: string;
  promoVideoStorage?: {
    provider: 'arvan' | 's3' | 'b2' | 'cloudinary';
    key: string;
  };
  instructor: mongoose.Types.ObjectId;
  coInstructors?: mongoose.Types.ObjectId[];
  category: mongoose.Types.ObjectId;
  subCategory?: mongoose.Types.ObjectId;
  level: CourseLevel;
  language: string;
  price: number;
  discountPrice?: number;
  discountEndsAt?: Date;
  discountType: DiscountType;
  countdownDiscount?: ICountdownDiscount;
  isFree: boolean;
  status: CourseStatus;
  rejectionReason?: string;
  requirements: string[];
  requirementCourses: { _id: string; title: string; slug: string }[];
  learningOutcomes: string[];
  targetAudience: string[];
  tags: string[];
  totalDuration: number;
  totalLectures: number;
  totalSections: number;
  totalStudents: number;
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
  totalRevenue: number;
  hasCertificate: boolean;
  hasLifetimeAccess: boolean;
  hasSupport: boolean;
  maxStudents?: number;
  installmentEnabled: boolean;
  installmentCount: number;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  isFeatured: boolean;
  isBestseller: boolean;
  isRecentlyPublished: boolean;
  tenant?: mongoose.Types.ObjectId;
  publishedAt?: Date;
  lastUpdatedContent?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ✅ FIX: تشخیص فعال بودن multi-tenant
const IS_MULTI_TENANT = process.env.MULTI_TENANT_ENABLED === 'true';

const courseSchema = new Schema<ICourse>(
  {
    title: {
      type: String,
      required: [true, 'عنوان دوره الزامی است'],
      trim: true,
      minlength: [10, 'عنوان باید حداقل 10 کاراکتر باشد'],
      maxlength: [150, 'عنوان حداکثر 150 کاراکتر می‌تواند باشد'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    subtitle: {
      type: String,
      maxlength: 5000,
    },
    description: {
      type: String,
      required: [true, 'توضیحات دوره الزامی است'],
      minlength: [100, 'توضیحات باید حداقل 100 کاراکتر باشد'],
    },
    shortDescription: {
      type: String,
      maxlength: 1000, // Increased to allow HTML tags; plain text limit enforced by express-validator (300 chars)
    },
    thumbnail: {
      type: String,
      default: '',
    },
    promoVideo: { type: String },
    promoVideoType: {
      type: String,
      enum: Object.values(PromoVideoType),
      default: PromoVideoType.UPLOAD,
    },
    promoVideoUrl: { type: String },
    promoVideoKey: { type: String, default: null },
    promoVideoBucket: { type: String, default: null },
    promoVideoStorage: {
      type: {
        provider: { type: String, enum: ['arvan', 's3', 'b2', 'cloudinary'], default: 'arvan' },
        key: { type: String },
      },
      default: null,
    },

    instructor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    coInstructors: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    subCategory: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
    },

    level: {
      type: String,
      enum: Object.values(CourseLevel),
      default: CourseLevel.ALL_LEVELS,
    },
    language: { type: String, default: 'fa' },

    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    discountEndsAt: { type: Date },
    discountType: {
      type: String,
      enum: ['none', 'manual', 'countdown'],
      default: 'none',
    },
    countdownDiscount: {
      type: {
        enabled: { type: Boolean, default: false },
        startAt: { type: Date },
        endAt: { type: Date },
        initialPercent: { type: Number, min: 0, max: 100 },
        finalPercent: { type: Number, min: 0, max: 100 },
        mode: { type: String, enum: ['linear', 'step'], default: 'linear' },
        stepIntervalMinutes: { type: Number, min: 1 },
        stepPercent: { type: Number, min: 0, max: 100 },
      },
      default: null,
    },
    isFree: { type: Boolean, default: false },

    status: {
      type: String,
      enum: Object.values(CourseStatus),
      default: CourseStatus.DRAFT,
      index: true,
    },
    rejectionReason: { type: String },

    requirements: [{ type: String, maxlength: 300 }],
    requirementCourses: [
      {
        _id: { type: String, required: true },
        title: { type: String, required: true },
        slug: { type: String, required: true },
      },
    ],
    learningOutcomes: [{ type: String, maxlength: 300 }],
    targetAudience: [{ type: String, maxlength: 300 }],
    tags: [{ type: String, lowercase: true, trim: true }],

    totalDuration: { type: Number, default: 0 },
    totalLectures: { type: Number, default: 0 },
    totalSections: { type: Number, default: 0 },
    totalStudents: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingDistribution: {
      five: { type: Number, default: 0 },
      four: { type: Number, default: 0 },
      three: { type: Number, default: 0 },
      two: { type: Number, default: 0 },
      one: { type: Number, default: 0 },
    },

    totalRevenue: { type: Number, default: 0 },

    hasCertificate: { type: Boolean, default: true },
    hasLifetimeAccess: { type: Boolean, default: true },
    hasSupport: { type: Boolean, default: false },
    maxStudents: { type: Number, min: 1 },
    installmentEnabled: { type: Boolean, default: false },
    installmentCount: { type: Number, default: 3, enum: [2, 3, 6] },

    metaTitle: { type: String, maxlength: 60 },
    metaDescription: { type: String, maxlength: 200 },
    metaKeywords: [{ type: String }],

    isFeatured: { type: Boolean, default: false, index: true },
    isBestseller: { type: Boolean, default: false, index: true },
    isRecentlyPublished: { type: Boolean, default: true },

    // ✅ FIX: tenant optional
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: IS_MULTI_TENANT,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

courseSchema.index(
  { title: 'text', description: 'text', tags: 'text', requirements: 'text' },
  { default_language: 'none', language_override: 'none' },
);
courseSchema.index({ tenant: 1, status: 1, publishedAt: -1 });
courseSchema.index({ tenant: 1, category: 1, status: 1 });
courseSchema.index({ tenant: 1, instructor: 1, status: 1 });

courseSchema.virtual('currentPrice').get(function (this: ICourse) {
  const { calculateCoursePricing } = require('../services/pricing.service');
  const pricing = calculateCoursePricing(this);
  return pricing.currentPrice;
});

courseSchema.virtual('discountPercentage').get(function (this: ICourse) {
  const { calculateCoursePricing } = require('../services/pricing.service');
  const pricing = calculateCoursePricing(this);
  return pricing.currentDiscountPercent;
});

courseSchema.virtual('pricing').get(function (this: ICourse) {
  const { calculateCoursePricing } = require('../services/pricing.service');
  return calculateCoursePricing(this);
});

// ✅ FIX: plugin شرطی
if (IS_MULTI_TENANT) {
  courseSchema.plugin(tenantPlugin);
}

const Course: Model<ICourse> = mongoose.model<ICourse>('Course', courseSchema);
export default Course;