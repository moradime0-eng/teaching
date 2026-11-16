import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IDiscussion extends Document {
  _id: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId;
  lecture?: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  title: string;
  content: string;
  type: 'question' | 'note' | 'announcement';
  isPinned: boolean;
  isResolved: boolean;
  upvotes: mongoose.Types.ObjectId[];
  downvotes: mongoose.Types.ObjectId[];
  replies: {
    user: mongoose.Types.ObjectId;
    content: string;
    isInstructorReply: boolean;
    upvotes: mongoose.Types.ObjectId[];
    downvotes: mongoose.Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
  }[];
  tags: string[];
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const discussionSchema = new Schema<IDiscussion>(
  {
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    lecture: {
      type: Schema.Types.ObjectId,
      ref: 'Lecture',
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان الزامی است'],
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: [true, 'محتوا الزامی است'],
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['question', 'note', 'announcement'],
      default: 'question',
    },
    isPinned: { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false },
    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    downvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    replies: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        content: { type: String, required: true, maxlength: 3000 },
        isInstructorReply: { type: Boolean, default: false },
        upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        downvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    tags: [{ type: String, trim: true }],
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

discussionSchema.index({ course: 1, lecture: 1, createdAt: -1 });
discussionSchema.index({ course: 1, type: 1, createdAt: -1 });
discussionSchema.index({ user: 1, course: 1 });
discussionSchema.index({ tenant: 1, course: 1, lecture: 1 });
discussionSchema.index({ tenant: 1, user: 1, course: 1 });

// Apply tenant isolation plugin
discussionSchema.plugin(tenantPlugin);

const Discussion: Model<IDiscussion> = mongoose.model<IDiscussion>('Discussion', discussionSchema);
export default Discussion;