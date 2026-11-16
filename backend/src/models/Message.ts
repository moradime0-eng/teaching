import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  conversation: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content: string;
  attachments?: {
    url: string;
    type: string;
    name: string;
    size: number;
  }[];
  readBy: {
    user: mongoose.Types.ObjectId;
    readAt: Date;
  }[];
  isEdited: boolean;
  isDeleted: boolean;
  replyTo?: mongoose.Types.ObjectId;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}


const messageSchema = new Schema<IMessage>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    attachments: [
      {
        url: { type: String, required: true },
        type: { type: String, required: true },
        name: { type: String, required: true },
        size: { type: Number },
      },
    ],
    readBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
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

messageSchema.index({ conversation: 1, createdAt: -1 });
// Tenant-scoped indexes
messageSchema.index({ tenant: 1, conversation: 1, createdAt: -1 });
messageSchema.index({ tenant: 1, sender: 1, createdAt: -1 });
// Apply tenant isolation plugin
messageSchema.plugin(tenantPlugin);

const Message: Model<IMessage> = mongoose.model<IMessage>('Message', messageSchema);
export default Message;
