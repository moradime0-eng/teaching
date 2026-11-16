/**
 * 🏭 فکتوری‌های داده‌ی آزمایشی برای تست‌های مالی
 *
 * نکات:
 * - رمز عبور از یک هش bcrypt جعلیِ شروع‌شونده با `$2` است تا هوک pre-save
 *   (bcrypt با cost 12) آن را دوباره هش نکند و تست‌ها سریع بمانند.
 * - حداقل طول‌های مدل‌ها رعایت شده: عنوان دوره ≥۱۰، توضیحات ≥۱۰۰ کاراکتر.
 * - `tenant` در مدل‌ها با plugin غیرالزامی شده؛ نیازی به ساخت Tenant نیست.
 */
import mongoose from 'mongoose';
import User from '../models/User';
import Course from '../models/Course';
import Coupon from '../models/Coupon';
import { UserRole, CourseStatus } from '../types';

/** هش جعلی — هوک pre-save آن را هش نمی‌کند (startsWith('$2')) */
export const PRE_HASHED_PASSWORD = '$2a$12$abcdefghijklmnopqrstuvwxyzABCDEFG';

const LONG_DESCRIPTION =
  'This is a comprehensive test course description that is intentionally long enough to satisfy the platform minimum length validation rules.';

let seq = 0;
function nextId(): string {
  seq += 1;
  return `${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createStudent(overrides: Record<string, unknown> = {}) {
  return User.create({
    fullName: 'دانشجوی آزمایشی',
    email: `student-${nextId()}@test.local`,
    password: PRE_HASHED_PASSWORD,
    role: UserRole.STUDENT,
    ...overrides,
  });
}

export async function createInstructor(overrides: Record<string, unknown> = {}) {
  return User.create({
    fullName: 'مدرس آزمایشی',
    email: `instructor-${nextId()}@test.local`,
    password: PRE_HASHED_PASSWORD,
    role: UserRole.INSTRUCTOR,
    instructorProfile: {
      headline: 'مدرس تست',
      totalStudents: 0,
      totalCourses: 0,
      totalReviews: 0,
      averageRating: 0,
      totalEarnings: 0,
      isApproved: true,
    },
    ...overrides,
  });
}

export async function createAdmin(overrides: Record<string, unknown> = {}) {
  return User.create({
    fullName: 'مدیر آزمایشی',
    email: `admin-${nextId()}@test.local`,
    password: PRE_HASHED_PASSWORD,
    role: UserRole.ADMIN,
    ...overrides,
  });
}

export async function createCourse(
  instructorId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {},
) {
  return Course.create({
    title: `دوره آزمایشی مالی ${nextId()}`,
    slug: `test-course-${nextId()}`,
    description: LONG_DESCRIPTION,
    instructor: instructorId,
    category: new mongoose.Types.ObjectId(),
    price: 10000,
    status: CourseStatus.PUBLISHED,
    ...overrides,
  });
}

export async function createCoupon(overrides: Record<string, unknown> = {}) {
  return Coupon.create({
    code: `CPN-${nextId()}`.toUpperCase(),
    discountType: 'percentage',
    discountValue: 10,
    validFrom: new Date(Date.now() - 60 * 60 * 1000),
    validUntil: new Date(Date.now() + 60 * 60 * 1000),
    createdBy: new mongoose.Types.ObjectId(),
    usageLimitPerUser: 1,
    isActive: true,
    ...overrides,
  });
}
