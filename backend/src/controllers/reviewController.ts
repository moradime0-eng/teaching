import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Review from '../models/Review';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { invalidateCache } from '../middlewares/cache';
import { syncCourseRating, syncInstructorRating } from '../services/courseRating.service';
import { NotificationType } from '../types';
import { createNotification } from './notificationController';

/**
 * همگام‌سازی ریتینگ دوره و مدرس پس از ثبت یا تغییر نظر
 */
const syncRatingsAfterReviewChange = async (courseId: string) => {
  try {
    await syncCourseRating(courseId);

    // همگام‌سازی ریتینگ مدرس مربوطه
    const course = await Course.findById(courseId).select('instructor');
    if (course?.instructor) {
      await syncInstructorRating(course.instructor.toString());
    }

    // پاکسازی کش‌ها برای نمایش آنی نظرات و ریتینگ‌های جدید
    await invalidateCache([
      `cache:*courses*`,
      `cache:*search*`,
      `cache:*instructor*`,
      `cache:*review*`,
    ]);
  } catch (error) {
    console.error(`❌ [Rating Sync Failed] Course ${courseId}:`, error);
  }
};

// ==================== CREATE REVIEW ====================
export const createReview = asyncHandler(async (req: Request, res: Response) => {
  const { rating, comment, title } = req.body;
  let courseId = req.body.courseId;
  if (!req.user) throw ApiError.unauthorized();

  if (!courseId && req.params.slug) {
    const course = await Course.findOne({ slug: req.params.slug }).select('_id');
    if (!course) throw ApiError.notFound('دوره مورد نظر یافت نشد');
    courseId = course._id.toString();
  }

  if (!courseId) throw ApiError.badRequest('شناسه دوره الزامی است');

  const courseExists = await Course.findById(courseId).select('_id instructor slug title');
  if (!courseExists) throw ApiError.notFound('دوره مورد نظر یافت نشد');

  const enrolled = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    // ✅ FIX: دانشجوی بازپرداخت‌شده (نرم‌حذف) دیگر اجازه‌ی ثبت نظر ندارد
    isRefunded: { $ne: true },
  });
  if (!enrolled && req.user.role !== 'admin') {
    throw ApiError.forbidden('برای ثبت نظر ابتدا باید در دوره ثبت‌نام کنید');
  }

  const existingReview = await Review.findOne({ user: req.user._id, course: courseId });
  if (existingReview) {
    throw ApiError.conflict('شما قبلاً برای این دوره نظر خود را ثبت کرده‌اید');
  }

  const reviewData: any = {
    user: req.user._id,
    course: courseId,
    rating,
    comment,
    title,
  };

  const IS_MULTI_TENANT = process.env.MULTI_TENANT_ENABLED === 'true';
  if (IS_MULTI_TENANT) {
    const tenantId = (req as any).tenantId || (req as any).tenant?._id;
    if (tenantId) {
      reviewData.tenant = tenantId;
    }
  }

  const review = await Review.create(reviewData);
  await syncRatingsAfterReviewChange(courseId);

  // 🔔 اطلاع‌رسانی به مدرس دوره (به‌جز وقتی مدرس خودش نظر ثبت کند)
  const instructorId = courseExists.instructor?.toString();
  if (instructorId && instructorId !== req.user._id.toString()) {
    await createNotification({
      recipient: instructorId,
      sender: req.user._id.toString(),
      type: NotificationType.REVIEW,
      title: 'نظر جدید در دوره شما',
      message: `${req.user.fullName} به دوره «${courseExists.title}» ${rating} از ۵ امتیاز داد.`,
      link: `/course/${courseExists.slug}`,
      data: { courseId: String(courseId), reviewId: review._id.toString(), rating },
    });
  }

  const populatedReview = await Review.findById(review._id).populate('user', 'fullName avatar');
  return ApiResponse.created(res, populatedReview, 'نظر شما با موفقیت ثبت شد');
});

// ==================== GET COURSE REVIEWS ====================
export const getCourseReviews = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
  const skip = (page - 1) * limit;

  const [reviews, total] = await Promise.all([
    Review.find({ course: courseId, isHidden: { $ne: true } })
      .populate('user', 'fullName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments({ course: courseId, isHidden: { $ne: true } }),
  ]);

  return ApiResponse.paginated(res, reviews, page, limit, total);
});

// ==================== UPDATE REVIEW ====================
export const updateReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const review = await Review.findById(id);
  if (!review) throw ApiError.notFound('نظر مورد نظر یافت نشد');

  if (review.user.toString() !== req.user._id.toString()) {
    throw ApiError.forbidden('شما اجازه ویرایش این نظر را ندارید');
  }

  if (req.body.rating !== undefined) review.rating = req.body.rating;
  if (req.body.title !== undefined) review.title = req.body.title;
  if (req.body.comment !== undefined) review.comment = req.body.comment;
  review.isEdited = true;

  await review.save();
  await syncRatingsAfterReviewChange(review.course.toString());

  const populatedReview = await Review.findById(review._id).populate('user', 'fullName avatar');
  return ApiResponse.success(res, populatedReview, 'نظر شما با موفقیت ویرایش شد');
});

// ==================== DELETE REVIEW ====================
export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const review = await Review.findById(id);
  if (!review) throw ApiError.notFound('نظر مورد نظر یافت نشد');

  const isOwner = review.user.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    throw ApiError.forbidden('شما اجازه حذف این نظر را ندارید');
  }

  const courseId = review.course.toString();
  await Review.findByIdAndDelete(id);
  await syncRatingsAfterReviewChange(courseId);

  return ApiResponse.success(res, null, 'نظر با موفقیت حذف شد');
});

// ==================== LIKE/DISLIKE REVIEW ====================
export const likeReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { type } = req.body;
  if (!req.user) throw ApiError.unauthorized();

  const review = await Review.findById(id);
  if (!review) throw ApiError.notFound('نظر مورد نظر یافت نشد');

  const userId = req.user._id;
  const isLiked = review.helpful.some((u) => u.toString() === userId.toString());
  const isDisliked = review.notHelpful.some((u) => u.toString() === userId.toString());

  if (type === 'like') {
    if (isLiked) {
      review.helpful = review.helpful.filter((u) => u.toString() !== userId.toString());
    } else {
      review.helpful.push(userId);
      if (isDisliked) {
        review.notHelpful = review.notHelpful.filter((u) => u.toString() !== userId.toString());
      }
    }
  } else if (type === 'dislike') {
    if (isDisliked) {
      review.notHelpful = review.notHelpful.filter((u) => u.toString() !== userId.toString());
    } else {
      review.notHelpful.push(userId);
      if (isLiked) {
        review.helpful = review.helpful.filter((u) => u.toString() !== userId.toString());
      }
    }
  }

  review.helpfulCount = review.helpful.length;
  await review.save();

  return ApiResponse.success(
    res,
    {
      helpfulCount: review.helpfulCount,
      helpful: review.helpful.length,
      notHelpful: review.notHelpful.length,
    },
    'عملیات با موفقیت انجام شد',
  );
});

// ==================== GET TOP REVIEWS (Landing Page Slider) ====================
export const getTopReviews = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(+((req.query.limit as string) || '6'), 20);

  // ⭐ تغییر برای تست راحت‌تر: پذیرش نظرات با امتیاز ۲ به بالا (در پروژه عملیاتی می‌توانید روی ۴ یا ۵ بگذارید)
  const minRatingThreshold = process.env.NODE_ENV === 'development' ? 2 : 4;

  const reviews = await Review.find({
    rating: { $gte: minRatingThreshold }, // 👈 حالا در حالت توسعه نظرات با امتیاز ۲ هم نمایش داده می‌شوند!
    isHidden: { $ne: true },
  })
    .populate('user', 'fullName avatar')
    .populate('course', 'title slug thumbnail')
    .sort({ helpfulCount: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  return ApiResponse.success(res, reviews, 'نظرات برتر با موفقیت دریافت شد');
});
