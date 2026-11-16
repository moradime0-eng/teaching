import mongoose, { Schema, Document, Model } from 'mongoose';
import { globalPlugin } from '../plugins/tenantPlugin';

export interface IReport extends Document {
  _id: mongoose.Types.ObjectId;
  reporter: mongoose.Types.ObjectId;
  targetType: 'course' | 'review' | 'user' | 'message';
  targetId: mongoose.Types.ObjectId;
  reason: string;
  description?: string;
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  actionTaken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['course', 'review', 'user', 'message'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    reason: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: ['pending', 'reviewing', 'resolved', 'dismissed'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    actionTaken: { type: String },
  },
  { timestamps: true },
);

// Apply global plugin (Report is global, not tenant-scoped)
reportSchema.plugin(globalPlugin);

const Report: Model<IReport> = mongoose.model<IReport>('Report', reportSchema);
export default Report;
