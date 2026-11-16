// backend/src/models/LearningPathEnrollment.ts

import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

interface ICompletedCourse {
  course: Types.ObjectId;
  completedAt: Date;
  grade?: number;
}

export interface ILearningPathEnrollment extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  learningPath: Types.ObjectId;

  progress: number;
  completedCourses: ICompletedCourse[];
  currentStageIndex: number;
  currentCourse?: Types.ObjectId;

  status: 'active' | 'completed' | 'paused' | 'abandoned';

  enrolledAt: Date;
  completedAt?: Date;
  lastAccessedAt: Date;
  totalTimeSpent: number;

  certificateIssued: boolean;
  certificate?: Types.ObjectId;

  rating?: number;
  review?: string;

  tenant?: Types.ObjectId;
}

const CompletedCourseSchema = new Schema<ICompletedCourse>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    grade: Number,
  },
  { _id: false },
);

const LearningPathEnrollmentSchema = new Schema<ILearningPathEnrollment>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    learningPath: {
      type: Schema.Types.ObjectId,
      ref: 'LearningPath',
      required: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    completedCourses: [CompletedCourseSchema],
    currentStageIndex: {
      type: Number,
      default: 0,
    },
    currentCourse: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'paused', 'abandoned'],
      default: 'active',
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    totalTimeSpent: {
      type: Number,
      default: 0,
    },
    certificateIssued: { type: Boolean, default: false },
    certificate: {
      type: Schema.Types.ObjectId,
      ref: 'Certificate',
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      maxlength: 2000,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: process.env.MULTI_TENANT_ENABLED === 'true',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

LearningPathEnrollmentSchema.index({ user: 1, learningPath: 1 }, { unique: true });
LearningPathEnrollmentSchema.index({ user: 1, status: 1 });
LearningPathEnrollmentSchema.index({ learningPath: 1 });
LearningPathEnrollmentSchema.index({ tenant: 1, user: 1, status: 1 });
LearningPathEnrollmentSchema.index({ tenant: 1, learningPath: 1 });

LearningPathEnrollmentSchema.plugin(tenantPlugin);

const LearningPathEnrollment: Model<ILearningPathEnrollment> =
  mongoose.model<ILearningPathEnrollment>('LearningPathEnrollment', LearningPathEnrollmentSchema);
export default LearningPathEnrollment;