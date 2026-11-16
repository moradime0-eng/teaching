import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IProgress extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  lecture: mongoose.Types.ObjectId;
  
  isCompleted: boolean;
  completedAt?: Date;
  watchedDuration: number;
  lastPosition: number;
  
  quizScore?: number;
  quizAttempts?: {
    score: number;
    attemptedAt: Date;
    answers: number[];
  }[];
  
  assignmentSubmission?: {
    content?: string;
    fileUrl?: string;
    submittedAt: Date;
    grade?: number;
    feedback?: string;
  };
  
  notes?: {
    content: string;
    timestamp?: number;
    createdAt: Date;
  }[];

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  
  createdAt: Date;
  updatedAt: Date;
}

const progressSchema = new Schema<IProgress>(
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
    lecture: {
      type: Schema.Types.ObjectId,
      ref: 'Lecture',
      required: true,
    },

    isCompleted: { type: Boolean, default: false },
    completedAt: { type: Date },
    watchedDuration: { type: Number, default: 0 },
    lastPosition: { type: Number, default: 0 },

    quizScore: { type: Number, min: 0, max: 100 },
    quizAttempts: [
      {
        score: Number,
        attemptedAt: { type: Date, default: Date.now },
        answers: [Number],
      },
    ],

    assignmentSubmission: {
      content: String,
      fileUrl: String,
      submittedAt: Date,
      grade: { type: Number, min: 0, max: 100 },
      feedback: String,
    },

    notes: [
      {
        content: { type: String, required: true, maxlength: 1000 },
        timestamp: Number,
        createdAt: { type: Date, default: Date.now },
      },
    ],
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

progressSchema.index({ user: 1, course: 1, lecture: 1 }, { unique: true });
progressSchema.index({ user: 1, course: 1 });
// Tenant-scoped indexes
progressSchema.index({ tenant: 1, user: 1, course: 1, lecture: 1 }, { unique: true });
progressSchema.index({ tenant: 1, user: 1, course: 1 });
progressSchema.index({ tenant: 1, course: 1, lecture: 1 });
// Apply tenant isolation plugin
progressSchema.plugin(tenantPlugin);

const Progress: Model<IProgress> = mongoose.model<IProgress>('Progress', progressSchema);
export default Progress;