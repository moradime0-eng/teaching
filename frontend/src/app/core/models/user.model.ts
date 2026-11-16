export enum UserRole {
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
  ADMIN = 'admin',
}

export interface User {
  mobile: string;
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  role: UserRole;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string;
  isProfileComplete?: boolean;
  instructorProfile?: InstructorProfile;
  studentProfile?: StudentProfile;
  wallet: Wallet;
  lastLogin?: string;
  preferredLanguage: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstructorProfile {
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
}

export interface StudentProfile {
  interests?: string[];
  learningGoals?: string;
  completedCourses: number;
  totalLearningTime: number;
}

export interface Wallet {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  confirmPassword?: string; // 👈 علامت سوال اضافه شد (اختیاری شد)
  phone?: string;
  role?: UserRole;
}

export interface UpdateProfileRequest {
  fullName?: string;
  phone?: string;
  bio?: string;
  preferredLanguage?: string;
  timezone?: string;
}
