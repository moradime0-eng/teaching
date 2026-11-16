import mongoose, { Schema, Document, Model } from 'mongoose';

export enum MembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  INSTRUCTOR = 'instructor',
  STUDENT = 'student',
}

export enum MembershipStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  REJECTED = 'rejected',
}

export interface IMembership extends Document {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  tenant: mongoose.Types.ObjectId;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: Date;
  invitedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const membershipSchema = new Schema<IMembership>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(MembershipRole),
      default: MembershipRole.STUDENT,
    },
    status: {
      type: String,
      enum: Object.values(MembershipStatus),
      default: MembershipStatus.ACTIVE,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

// Unique constraint: one membership per user per tenant
membershipSchema.index({ user: 1, tenant: 1 }, { unique: true });

// Index for querying members of a tenant by role
membershipSchema.index({ tenant: 1, role: 1 });
membershipSchema.index({ tenant: 1, status: 1 });
membershipSchema.index({ user: 1, status: 1 });

const Membership: Model<IMembership> = mongoose.model<IMembership>('Membership', membershipSchema);
export default Membership;
