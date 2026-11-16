import mongoose, { Schema, Document, Model } from 'mongoose';
import { tenantPlugin } from '../plugins/tenantPlugin';

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  course?: mongoose.Types.ObjectId;
  lastMessage?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  unreadCount: {
    user: mongoose.Types.ObjectId;
    count: number;
  }[];
  mutedBy: mongoose.Types.ObjectId[];
  isGroup: boolean;
  groupName?: string;
  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    course: { type: Schema.Types.ObjectId, ref: 'Course' },
    lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
    lastMessageAt: { type: Date },
    unreadCount: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 },
      },
    ],
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, maxlength: 100 },
    mutedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
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

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageAt: -1 });
// Tenant-scoped indexes
conversationSchema.index({ tenant: 1, participants: 1 });
conversationSchema.index({ tenant: 1, course: 1 });
conversationSchema.index({ tenant: 1, lastMessageAt: -1 });
// Apply tenant isolation plugin
conversationSchema.plugin(tenantPlugin);

const Conversation: Model<IConversation> = mongoose.model<IConversation>(
  'Conversation',
  conversationSchema,
);
export default Conversation;
