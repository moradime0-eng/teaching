import mongoose, { Schema, Document, Model } from 'mongoose';
import { TicketStatus } from '../types';
import { tenantPlugin } from '../plugins/tenantPlugin';

interface ITicketMessage {
  sender: mongoose.Types.ObjectId;
  content: string;
  attachments?: {
    url: string;
    name: string;
  }[];
  createdAt: Date;
}

export interface ITicket extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: TicketStatus;
  messages: ITicketMessage[];
  assignedTo?: mongoose.Types.ObjectId;
  relatedCourse?: mongoose.Types.ObjectId;
  closedAt?: Date;
  resolvedAt?: Date;

  // Multi-tenancy
  tenant: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    subject: { type: String, required: true, maxlength: 200 },
    category: {
      type: String,
      required: true,
      enum: ['technical', 'billing', 'course', 'account', 'other'],
    },

    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },

    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.OPEN,
      index: true,
    },

    messages: [
      {
        sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        content: { type: String, required: true, maxlength: 5000 },
        attachments: [
          {
            url: String,
            name: String,
          },
        ],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    relatedCourse: { type: Schema.Types.ObjectId, ref: 'Course' },
    closedAt: { type: Date },
    resolvedAt: { type: Date },
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

ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
// Tenant-scoped indexes
ticketSchema.index({ tenant: 1, user: 1, status: 1 });
ticketSchema.index({ tenant: 1, status: 1, priority: 1 });
ticketSchema.index({ tenant: 1, ticketNumber: 1 }, { unique: true });
ticketSchema.index({ tenant: 1, assignedTo: 1, status: 1 });

// Apply tenant isolation plugin
ticketSchema.plugin(tenantPlugin);

const Ticket: Model<ITicket> = mongoose.model<ITicket>('Ticket', ticketSchema);
export default Ticket;
