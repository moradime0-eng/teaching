import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IEnrollment extends Document {
  _id: mongoose.Types.ObjectId;
  student: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  payment?: mongoose.Types.ObjectId;

  pricePaid: number;
  couponUsed?: mongoose.Types.ObjectId;
  /** کمپین تخفیف سراسری که روی این ثبت‌نام اعمال شده (برای گزارش‌گیری و اتریبیوشن) */
  campaignUsed?: mongoose.Types.ObjectId;

  progress: number;
  completedLectures: mongoose.Types.ObjectId[];
  currentLecture?: mongoose.Types.ObjectId;

  isCompleted: boolean;
  completedAt?: Date;

  certificateIssued: boolean;
  certificate?: mongoose.Types.ObjectId;

  totalTimeSpent: number;
  lastAccessedAt?: Date;

  hasReviewed: boolean;

  expiresAt?: Date;
  isRefunded: boolean;
  refundedAt?: Date;
  refundReason?: string;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    student: {
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
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },

    pricePaid: { type: Number, required: true, min: 0 },
    couponUsed: { type: Schema.Types.ObjectId, ref: 'Coupon' },
    /** کمپین تخفیف سراسری که روی این ثبت‌نام اعمال شده (برای گزارش‌گیری و اتریبیوشن) */
    campaignUsed: { type: Schema.Types.ObjectId, ref: 'Campaign' },

    progress: { type: Number, default: 0, min: 0, max: 100 },
    completedLectures: [{ type: Schema.Types.ObjectId, ref: 'Lecture' }],
    currentLecture: { type: Schema.Types.ObjectId, ref: 'Lecture' },

    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },

    certificateIssued: { type: Boolean, default: false },
    certificate: { type: Schema.Types.ObjectId, ref: 'Certificate' },

    totalTimeSpent: { type: Number, default: 0 },
    lastAccessedAt: { type: Date },

    hasReviewed: { type: Boolean, default: false },

    expiresAt: { type: Date },
    isRefunded: { type: Boolean, default: false },
    refundedAt: { type: Date },
    refundReason: { type: String },
    // Multi-tenancy
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ student: 1, isCompleted: 1 });
enrollmentSchema.index({ course: 1, createdAt: -1 });
// Tenant-scoped indexes
enrollmentSchema.index({ tenant: 1, student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ tenant: 1, student: 1, isCompleted: 1 });
enrollmentSchema.index({ tenant: 1, course: 1, createdAt: -1 });
// Apply tenant isolation plugin
enrollmentSchema.plugin(tenantPlugin);

const Enrollment: Model<IEnrollment> = mongoose.model<IEnrollment>('Enrollment', enrollmentSchema);
export default Enrollment;

