import mongoose, { Schema, Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';

export interface IPendingRegistration {
  _id: string; // UUID
  email: string;
  otpCode: string; // hashed
  otpExpires: Date;
  emailVerified: boolean;
  password?: string; // plain, temporary — hashed at final step
  fullName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pendingRegistrationSchema = new Schema<IPendingRegistration>(
  {
    _id: { type: String, required: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: [/^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/, 'ایمیل معتبر نیست'],
    },
    otpCode: { type: String, required: true, select: false },
    otpExpires: { type: Date, required: true, select: false },
    emailVerified: { type: Boolean, default: false },
    password: { type: String, select: false },
    fullName: { type: String },
  },
  {
    timestamps: true,
    _id: false, // we use UUID string as _id
  },
);

// TTL index — auto-delete after 1 hour
pendingRegistrationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

// Hash OTP before saving
pendingRegistrationSchema.pre('save', async function (next) {
  if (!this.isModified('otpCode')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    (this as any).otpCode = await bcrypt.hash((this as any).otpCode, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare OTP
pendingRegistrationSchema.methods.compareOTP = async function (candidateOTP: string): Promise<boolean> {
  return bcrypt.compare(candidateOTP, this.otpCode);
};

const PendingRegistration: Model<IPendingRegistration> = mongoose.model<IPendingRegistration>(
  'PendingRegistration',
  pendingRegistrationSchema,
);

export default PendingRegistration;
