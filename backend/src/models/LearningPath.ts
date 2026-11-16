// backend/src/models/LearningPath.ts

import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface ICourseNode {
  _id?: Types.ObjectId;
  course: Types.ObjectId;
  order: number;
  isRequired: boolean;
  prerequisites: Types.ObjectId[];
  estimatedDuration: number;
  customTitle?: string;
  customDescription?: string;
}

export interface IStage {
  _id?: Types.ObjectId;
  title: string;
  description?: string;
  icon: string;
  color: string;
  order: number;
  courses: ICourseNode[];
  milestone?: {
    title: string;
    description: string;
    badge?: string;
  };
}

export interface ILearningPath extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  subtitle?: string;
  description: string;
  shortDescription: string;
  coverImage?: string;
  thumbnail?: string;
  icon?: string;
  stages: IStage[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  category?: Types.ObjectId;
  tags: string[];
  targetAudience: string[];
  learningOutcomes: string[];
  estimatedTotalDuration: number;
  totalCourses: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: Date;
  enrolledStudents: number;
  completionRate: number;
  averageRating: number;
  totalRatings: number;
  hasCertificate: boolean;
  certificateTitle?: string;
  isFeatured: boolean;
  displayOrder: number;
  createdBy: Types.ObjectId;
  tenant?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CourseNodeSchema = new Schema<ICourseNode>(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    order: { type: Number, required: true, default: 0 },
    isRequired: { type: Boolean, default: true },
    // ✅ FIX #5: isUnlocked حذف شد (هیچ‌جا enforce نمی‌شد)
    prerequisites: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    estimatedDuration: { type: Number, default: 0 },
    customTitle: String,
    customDescription: String,
  },
  { _id: true },
);

const StageSchema = new Schema<IStage>(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 10000 },
    icon: { type: String, default: '📚' },
    color: { type: String, default: '#a435f0' },
    order: { type: Number, required: true },
    courses: [CourseNodeSchema],
    milestone: { title: String, description: String, badge: String },
  },
  { _id: true },
);

const LearningPathSchema = new Schema<ILearningPath>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, lowercase: true },
    subtitle: { type: String, maxlength: 300 },
    description: { type: String },
    shortDescription: { type: String, maxlength: 1000 }, // Increased to allow HTML tags; plain text limit enforced by express-validator (300 chars)
    coverImage: String,
    thumbnail: String,
    icon: { type: String, default: '🛤️' },
    stages: { type: [StageSchema], default: [] },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'mixed'],
      default: 'mixed',
    },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    tags: [{ type: String, trim: true }],
    targetAudience: [{ type: String, trim: true }],
    learningOutcomes: [{ type: String, trim: true }],
    estimatedTotalDuration: { type: Number, default: 0 },
    totalCourses: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
    publishedAt: Date,
    enrolledStudents: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    hasCertificate: { type: Boolean, default: false },
    certificateTitle: String,
    isFeatured: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ───
LearningPathSchema.index({ slug: 1 }, { unique: true, sparse: true });
LearningPathSchema.index({ status: 1, isFeatured: -1 });
LearningPathSchema.index({ status: 1, displayOrder: 1, createdAt: -1 });
LearningPathSchema.index({ category: 1 });
LearningPathSchema.index({ createdBy: 1 });

// ─── Helper: Generate stable slug ───
function buildSlug(title: string): string {
  const base = (title || 'learning-path')
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const randomStr = Math.random().toString(36).substring(2, 7);
  return `${base || 'path'}-${Date.now().toString(36)}-${randomStr}`;
}

// ─── Helper: Recalculate totals from stages ───
function recalculateTotals(doc: any): void {
  if (!Array.isArray(doc.stages)) {
    doc.totalCourses = 0;
    doc.estimatedTotalDuration = 0;
    return;
  }
  let totalC = 0;
  let totalD = 0;
  doc.stages.forEach((stage: any) => {
    if (Array.isArray(stage.courses)) {
      totalC += stage.courses.length;
      stage.courses.forEach((cn: any) => {
        totalD += cn.estimatedDuration || 0;
      });
    }
  });
  doc.totalCourses = totalC;
  doc.estimatedTotalDuration = totalD;
}

// ─── Pre-save Hook ───
// ✅ FIX #35: Only generate slug on creation, never regenerate on title change
// ✅ FIX #35: Always recalculate totals (not just when stages modified)
LearningPathSchema.pre('save', function (next) {
  try {
    if (!this.slug) {
      this.slug = buildSlug(this.title);
    }

    // Always recalculate — safer than conditional
    recalculateTotals(this);

    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
      this.publishedAt = new Date();
    }

    next();
  } catch (err: any) {
    console.error('❌ [LearningPath pre-save] Error:', err.message);
    next(err);
  }
});

// ─── Pre-findOneAndUpdate Hook ───
// ✅ FIX #35: Recalculate totals when using findByIdAndUpdate
LearningPathSchema.pre('findOneAndUpdate', function (next) {
  try {
    const update: any = this.getUpdate() || {};
    const $set = update.$set || update;

    if (Array.isArray($set.stages)) {
      let totalC = 0;
      let totalD = 0;
      $set.stages.forEach((stage: any) => {
        if (Array.isArray(stage.courses)) {
          totalC += stage.courses.length;
          stage.courses.forEach((cn: any) => {
            totalD += cn.estimatedDuration || 0;
          });
        }
      });
      if (update.$set) {
        update.$set.totalCourses = totalC;
        update.$set.estimatedTotalDuration = totalD;
      } else {
        update.totalCourses = totalC;
        update.estimatedTotalDuration = totalD;
      }
      this.setUpdate(update);
    }

    next();
  } catch (err: any) {
    console.error('❌ [LearningPath pre-findOneAndUpdate] Error:', err.message);
    next(err);
  }
});

LearningPathSchema.plugin(tenantPlugin);

const LearningPath: Model<ILearningPath> = mongoose.model<ILearningPath>(
  'LearningPath',
  LearningPathSchema,
);
export default LearningPath;