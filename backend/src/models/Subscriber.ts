import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriber extends Document {
  email: string;
  subscribedAt: Date;
  isActive: boolean;
  unsubscribedAt?: Date;
}

const subscriberSchema = new Schema<ISubscriber>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'فرمت ایمیل نامعتبر است'],
    },
    subscribedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    unsubscribedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

subscriberSchema.index({ isActive: 1 });

export default mongoose.model<ISubscriber>('Subscriber', subscriberSchema);
