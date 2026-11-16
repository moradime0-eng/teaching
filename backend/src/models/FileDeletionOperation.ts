import mongoose, { Schema, Document, Model } from 'mongoose';

export type DeletionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IFileDeletionOperation extends Document {
  _id: mongoose.Types.ObjectId;
  s3Key: string;
  sourceType: 'lecture' | 'contentItem' | 'section';
  sourceId: string;
  field: string;
  status: DeletionStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fileDeletionOperationSchema = new Schema<IFileDeletionOperation>(
  {
    s3Key: {
      type: String,
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ['lecture', 'contentItem', 'section'],
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
    field: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    nextRetryAt: {
      type: Date,
      index: true,
    },
    lastError: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// ایندکس برای یافتن عملیات pending
fileDeletionOperationSchema.index({ status: 1, nextRetryAt: 1 });

const FileDeletionOperation: Model<IFileDeletionOperation> = mongoose.model<IFileDeletionOperation>(
  'FileDeletionOperation',
  fileDeletionOperationSchema,
);

export default FileDeletionOperation;
