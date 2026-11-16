import { Request, Response } from 'express';
import User from '../models/User';
import Course from '../models/Course';
import Review from '../models/Review';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { CourseStatus } from '../types';
import { calculateCoursePricing } from '../services/pricing.service';
import {
  computeBulkCourseRatings,
  applyRatingStatsToCourses,
} from '../services/courseRating.service';

// ==================== GET INSTRUCTOR PROFILE ====================
export const getInstructorProfile = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const instructor = await User.findById(id);
    if (!instructor) throw ApiError.notFound('مدرس مورد نظر یافت نشد');

    if (
      instructor.role !== 'instructor' &&
      instructor.role !== 'admin'
    ) {
      throw ApiError.notFound('مدرس مورد نظر یافت نشد');
    }

    const courses = await Course.find({
      instructor: instructor._id,
      status: CourseStatus.PUBLISHED,
    })
      .select(
        'title slug thumbnail price discountPrice discountType discountEndsAt countdownDiscount isFree averageRating totalStudents totalLectures totalDuration totalReviews instructor',
      )
      .populate('instructor', 'fullName avatar')
      .sort({ createdAt: -1 });

    const coursesWithPricing = courses.map((course) => {
      const courseObj = course.toObject() as any;
      const pricing = calculateCoursePricing(course);
      courseObj.pricing = pricing;
      courseObj.currentPrice = pricing.currentPrice;
      courseObj.discountPercentage = pricing.currentDiscountPercent;
      return courseObj;
    });

    // ⭐ محاسبه ریتینگ واقعی از جدول Review
    const instCourseIds = coursesWithPricing.map((c) => c._id);
    const instRatingMap = await computeBulkCourseRatings(instCourseIds);
    applyRatingStatsToCourses(coursesWithPricing, instRatingMap);

    // ⭐ محاسبه آمار تجمیعی واقعی از ریتینگ‌های محاسبه‌شده
    let totalStudents = 0;
    let totalReviewsCount = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    coursesWithPricing.forEach((c: any) => {
      totalStudents += c.totalStudents || 0;
      totalReviewsCount += c.totalReviews || 0;
      if (c.averageRating > 0) {
        ratingSum += c.averageRating;
        ratingCount++;
      }
    });

    const stats = {
      totalStudents,
      totalCourses: coursesWithPricing.length,
      totalReviews: totalReviewsCount,
      averageRating:
        ratingCount > 0
          ? Math.round((ratingSum / ratingCount) * 10) / 10
          : 0,
    };

    const instructorData = {
      _id: instructor._id,
      fullName: instructor.fullName,
      avatar: instructor.avatar,
      email: instructor.email,
      bio: instructor.bio,
      instructorProfile: instructor.instructorProfile || {},
      stats,
      courses: coursesWithPricing,
    };

    return ApiResponse.success(
      res,
      instructorData,
      'اطلاعات مدرس با موفقیت دریافت شد',
    );
  },
);

// ==================== GET INSTRUCTOR COURSES ====================
export const getInstructorCourses = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const courses = await Course.find({
      instructor: id,
      status: CourseStatus.PUBLISHED,
    })
      .select(
        'title slug thumbnail price discountPrice discountType discountEndsAt countdownDiscount isFree averageRating totalStudents totalLectures totalDuration totalReviews',
      )
      .populate('instructor', 'fullName avatar')
      .sort({ createdAt: -1 });

    const coursesWithPricing = courses.map((course) => {
      const courseObj = course.toObject() as any;
      const pricing = calculateCoursePricing(course);
      courseObj.pricing = pricing;
      courseObj.currentPrice = pricing.currentPrice;
      courseObj.discountPercentage = pricing.currentDiscountPercent;
      return courseObj;
    });

    // ⭐ محاسبه ریتینگ واقعی از جدول Review
    const instCoursesIds = coursesWithPricing.map((c) => c._id);
    const instCoursesRatingMap =
      await computeBulkCourseRatings(instCoursesIds);
    applyRatingStatsToCourses(coursesWithPricing, instCoursesRatingMap);

    return ApiResponse.success(
      res,
      coursesWithPricing,
      'دوره‌های مدرس با موفقیت دریافت شد',
    );
  },
);

// ==================== GET INSTRUCTOR REVIEWS ====================
export const getInstructorReviews = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const courses = await Course.find({
      instructor: id,
      status: CourseStatus.PUBLISHED,
    }).select('_id title slug');

    const courseIds = courses.map((c) => c._id);

    const reviews = await Review.find({
      course: { $in: courseIds },
      isHidden: { $ne: true },
    })
      .populate('user', 'fullName avatar')
      .populate('course', 'title slug')
      .sort({ createdAt: -1 })
      .limit(20);

    return ApiResponse.success(
      res,
      reviews,
      'نظرات مدرس با موفقیت دریافت شد',
    );
  },
);

// ==================== GET TOP INSTRUCTORS ====================
export const getTopInstructors = asyncHandler(
  async (req: Request, res: Response) => {
    const limit = Math.min(
      +((req.query.limit as string) || '6'),
      12,
    );

    const instructors = await User.find({ role: 'instructor' })
      .select('fullName avatar headline instructorProfile')
      .sort({ 'instructorProfile.totalStudents': -1 })
      .limit(limit)
      .lean();

    const result = instructors.map((inst: any) => ({
      _id: inst._id,
      name: inst.fullName,
      avatar: inst.avatar,
      headline:
        inst.headline ||
        inst.instructorProfile?.biography?.substring(0, 100) ||
        '',
      totalStudents: inst.instructorProfile?.totalStudents || 0,
      totalCourses: inst.instructorProfile?.totalCourses || 0,
      averageRating: inst.instructorProfile?.averageRating || 0,
      expertise: inst.instructorProfile?.expertise || [],
    }));

    return ApiResponse.success(
      res,
      result,
      'مدرسین برتر با موفقیت دریافت شد',
    );
  },
);