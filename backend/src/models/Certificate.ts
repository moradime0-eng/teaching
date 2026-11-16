import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface ICertificate extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;

  course?: mongoose.Types.ObjectId;
  enrollment?: mongoose.Types.ObjectId;
  learningPath?: mongoose.Types.ObjectId;
  learningPathEnrollment?: mongoose.Types.ObjectId;

  /** نوع گواهینامه — دوره یا مسیر یادگیری */
  type?: 'course' | 'learning-path';
  
  certificateNumber: string;
  verificationHash: string;
  
  studentName: string;
  courseName: string;
  instructorName: string;
  
  completedAt: Date;
  issuedAt: Date;
  totalHours: number;
  
  pdfUrl?: string;
  
  isRevoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<ICertificate>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // ✅ FIX: no longer required — learning-path certificates have no course/enrollment
    course: { type: Schema.Types.ObjectId, ref: 'Course' },
    enrollment: { type: Schema.Types.ObjectId, ref: 'Enrollment' },

    // ✅ FIX: learning-path certificates
    learningPath: { type: Schema.Types.ObjectId, ref: 'LearningPath' },
    learningPathEnrollment: { type: Schema.Types.ObjectId, ref: 'LearningPathEnrollment' },

    type: {
      type: String,
      enum: ['course', 'learning-path'],
      default: 'course',
    },

    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    verificationHash: {
      type: String,
      required: true,
      unique: true,
    },

    studentName: { type: String, required: true },
    courseName: { type: String, required: true },
    instructorName: { type: String, required: true },

    completedAt: { type: Date, required: true },
    issuedAt: { type: Date, default: Date.now },
    totalHours: { type: Number, required: true },

    pdfUrl: { type: String },

    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date },
    revokedReason: { type: String },
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

// ✅ Validation: a certificate must belong to EITHER a course OR a learning path
certificateSchema.pre('validate', function (next) {
  const hasCourse = !!(this as any).course && !!(this as any).enrollment;
  const hasPath =
    !!(this as any).learningPath || !!(this as any).learningPathEnrollment;

  if (!hasCourse && !hasPath) {
    return next(
      new Error('گواهینامه باید به یک دوره یا یک مسیر یادگیری متصل باشد'),
    );
  }

  // Auto-detect the type when not explicitly provided
  if (!(this as any).type) {
    (this as any).type = hasPath && !hasCourse ? 'learning-path' : 'course';
  }

  next();
});

// Tenant-scoped indexes
// ✅ FIX: the old `{ tenant, user, course }` unique index rejected learning-path
//    certificates (course === undefined → duplicate-key collision for the same user).
//    Two partial unique indexes now guard each domain independently.
certificateSchema.index(
  { tenant: 1, user: 1, course: 1 },
  {
    unique: true,
    partialFilterExpression: { course: { $type: 'objectId' } },
  },
);
certificateSchema.index(
  { tenant: 1, user: 1, learningPath: 1 },
  {
    unique: true,
    partialFilterExpression: { learningPath: { $type: 'objectId' } },
  },
);
certificateSchema.index({ tenant: 1, certificateNumber: 1 }, { unique: true });
certificateSchema.index({ tenant: 1, verificationHash: 1 }, { unique: true });
certificateSchema.index({ tenant: 1, user: 1, issuedAt: -1 });
certificateSchema.index({ tenant: 1, course: 1, issuedAt: -1 });
certificateSchema.index({ tenant: 1, learningPath: 1, issuedAt: -1 });
// Apply tenant isolation plugin
certificateSchema.plugin(tenantPlugin);

const Certificate: Model<ICertificate> = mongoose.model<ICertificate>(
  'Certificate',
  certificateSchema,
);
export default Certificate;