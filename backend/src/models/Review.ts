import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

const IS_MULTI_TENANT = process.env.MULTI_TENANT_ENABLED === 'true';

export interface IReview extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;

  helpful: mongoose.Types.ObjectId[];
  notHelpful: mongoose.Types.ObjectId[];
  helpfulCount: number;

  instructorReply?: {
    content: string;
    repliedAt: Date;
  };
  isReported: boolean;
  isHidden: boolean;
  isEdited: boolean;

  // Multi-tenancy
  tenant?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: { type: String, maxlength: 100 },
    comment: {
      type: String,
      required: [true, 'متن نظر الزامی است'],
      minlength: 10,
      maxlength: 2000,
    },

    helpful: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    notHelpful: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    helpfulCount: { type: Number, default: 0 },

    instructorReply: {
      content: { type: String, maxlength: 1000 },
      repliedAt: { type: Date },
    },

    isReported: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },

    // Multi-tenancy — فقط در حالت multi-tenant الزامی است
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: IS_MULTI_TENANT,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// ایندکس‌های بدون tenant (همیشه فعال)
reviewSchema.index({ user: 1, course: 1 }, { unique: true });
reviewSchema.index({ course: 1, rating: -1 });
reviewSchema.index({ course: 1, createdAt: -1 });
reviewSchema.index({ course: 1, isHidden: 1 });

// ایندکس‌های tenant-scoped (فقط در حالت multi-tenant)
if (IS_MULTI_TENANT) {
  reviewSchema.index({ tenant: 1, user: 1, course: 1 }, { unique: true });
  reviewSchema.index({ tenant: 1, course: 1, rating: -1 });
  reviewSchema.index({ tenant: 1, course: 1, createdAt: -1 });
  reviewSchema.plugin(tenantPlugin);
}

const Review: Model<IReview> = mongoose.model<IReview>('Review', reviewSchema);
export default Review;