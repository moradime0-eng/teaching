import mongoose, { Schema, Document, Model } from 'mongoose';
import { NotificationType } from '../types';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  recipient: mongoose.Types.ObjectId;
  sender?: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: object;
  link?: string;
  isRead: boolean;
  readAt?: Date;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}


const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed },
    link: { type: String },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
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

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
// Tenant-scoped indexes
notificationSchema.index({ tenant: 1, recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ tenant: 1, sender: 1, createdAt: -1 });
notificationSchema.index({ tenant: 1, type: 1, createdAt: -1 });
// Apply tenant isolation plugin
notificationSchema.plugin(tenantPlugin);

const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  notificationSchema,
);
export default Notification;
