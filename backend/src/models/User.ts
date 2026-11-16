import mongoose, { Schema, Document, Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '../types';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  password?: string; // optional for OAuth-only users
  phone?: string;
  avatar?: string;
  bio?: string;
  role: UserRole;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string;
  googleId?: string;
  githubId?: string;
  isProfileComplete: boolean;
  activeTenant?: mongoose.Types.ObjectId; // Currently active tenant for multi-tenancy

  instructorProfile?: {
    headline?: string;
    biography?: string;
    website?: string;
    socialLinks?: {
      linkedin?: string;
      twitter?: string;
      youtube?: string;
      instagram?: string;
    };
    expertise?: string[];
    totalStudents: number;
    totalCourses: number;
    totalReviews: number;
    averageRating: number;
    totalEarnings: number;
    isApproved: boolean;
  };

  studentProfile?: {
    interests?: string[];
    learningGoals?: string;
    completedCourses: number;
    totalLearningTime: number;
  };

  wallet: {
    balance: number;
    totalDeposited: number;
    totalWithdrawn: number;
    /** مجموع مبالغ پرداخت‌شده از کیف پول (نه برداشت) */
    totalSpent?: number;
  };

  resetPasswordOTP?: string;
  resetPasswordOTPExpires?: Date;
  phoneVerifyCode?: string;
  phoneVerifyExpires?: Date;

  refreshTokens: string[];

  lastLogin?: Date;
  lastLoginIP?: string;
  preferredLanguage: string;
  timezone: string;

  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: [true, 'نام و نام خانوادگی الزامی است'],
      trim: true,
      minlength: [3, 'نام باید حداقل 3 کاراکتر باشد'],
      maxlength: [100, 'نام حداکثر 100 کاراکتر می‌تواند باشد'],
    },
    email: {
      type: String,
      required: [true, 'ایمیل الزامی است'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/, 'ایمیل معتبر نیست'],
    },
    password: {
      type: String,
      required: [true, 'رمز عبور الزامی است'],
      minlength: [8, 'رمز عبور باید حداقل 8 کاراکتر باشد'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      match: [/^09\d{9}$/, 'شماره موبایل معتبر نیست'],
      sparse: true,
      unique: true,
    },
    avatar: { type: String, default: null },
    bio: { type: String, maxlength: 500 },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STUDENT,
    },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    googleId: { type: String, sparse: true, unique: true },
    githubId: { type: String, sparse: true, unique: true },
    isProfileComplete: { type: Boolean, default: true },

    instructorProfile: {
      headline: { type: String, maxlength: 200 },
      biography: { type: String, maxlength: 3000 },
      website: { type: String },
      socialLinks: {
        linkedin: String,
        twitter: String,
        youtube: String,
        instagram: String,
      },
      expertise: [{ type: String }],
      totalStudents: { type: Number, default: 0 },
      totalCourses: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0, min: 0, max: 5 },
      totalEarnings: { type: Number, default: 0 },
      isApproved: { type: Boolean, default: false },
    },

    studentProfile: {
      interests: [{ type: String }],
      learningGoals: { type: String, maxlength: 500 },
      completedCourses: { type: Number, default: 0 },
      totalLearningTime: { type: Number, default: 0 },
    },

    wallet: {
      balance: { type: Number, default: 0, min: 0 },
      totalDeposited: { type: Number, default: 0 },
      totalWithdrawn: { type: Number, default: 0 },
      // ⚠️ FIX: مجموع مبالغ خرج‌شده از کیف پول (پرداخت‌ها).
      // پیش از این، کد پرداخت، مبلغ را اشتباهاً در totalWithdrawn می‌ریخت
      // که با معنی «برداشت توسط کاربر» در تضاد بود و آمار را خراب می‌کرد.
      totalSpent: { type: Number, default: 0 },
    },

    resetPasswordOTP: { type: String, select: false },
    resetPasswordOTPExpires: { type: Date, select: false },
    phoneVerifyCode: { type: String, select: false },
    phoneVerifyExpires: { type: Date, select: false },

    refreshTokens: { type: [String], default: [], select: false },

    lastLogin: { type: Date },
    lastLoginIP: { type: String },
    preferredLanguage: { type: String, default: 'fa' },
    timezone: { type: String, default: 'Asia/Tehran' },
    activeTenant: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'instructorProfile.isApproved': 1 });
userSchema.index({ activeTenant: 1 });

userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    // 🛡️ اگر رمز قبلاً هش شده، دوباره هش نکن (جلوگیری از double-hash)
    if (this.password && (this.password as string).startsWith('$2')) {
      return next();
    }
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password as string, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password as string);
};

const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);
export default User;
