import { Request, Response } from 'express';
import Wishlist from '../models/Wishlist';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { calculateCoursePricing } from '../services/pricing.service';

export const getWishlist = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  let wishlist = await Wishlist.findOne({ user: req.user._id }).populate({
    path: 'courses.course',
    select: 'title slug thumbnail price discountPrice discountType discountEndsAt countdownDiscount isFree averageRating totalStudents totalReviews instructor',
    populate: { path: 'instructor', select: 'fullName avatar' },
  });

  if (!wishlist) {
    wishlist = await Wishlist.create({ user: req.user._id, courses: [],
      // [MULTI-TENANT-DISABLED] tenant: req.tenantId,
    });
  }

  // افزودن pricing به هر دوره
  const wishlistObj = wishlist.toObject() as any;
  if (wishlistObj.courses) {
    wishlistObj.courses = wishlistObj.courses.map((item: any) => {
      if (item.course && typeof item.course === 'object') {
        const pricing = calculateCoursePricing(item.course);
        item.course.pricing = pricing;
        item.course.currentPrice = pricing.currentPrice;
        item.course.discountPercentage = pricing.currentDiscountPercent;
      }
      return item;
    });
  }

  return ApiResponse.success(res, wishlistObj);
});

export const checkWishlist = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const wishlist = await Wishlist.findOne({ user: req.user._id });
  const inWishlist = wishlist?.courses?.some((item) => item.course.toString() === courseId) || false;

  return ApiResponse.success(res, { inWishlist });
});

export const toggleWishlist = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.body;
  if (!req.user) throw ApiError.unauthorized();

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('دوره مورد نظر یافت نشد');

  let wishlist = await Wishlist.findOne({ user: req.user._id });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: req.user._id, courses: [],
      // [MULTI-TENANT-DISABLED] tenant: req.tenantId,
    });
  }

  const existingIndex = wishlist.courses.findIndex((item) => item.course.toString() === courseId);

  if (existingIndex > -1) {
    // Remove if exists
    wishlist.courses.splice(existingIndex, 1);
    await wishlist.save();
    return ApiResponse.success(res, { inWishlist: false }, 'از علاقه‌مندی‌ها حذف شد');
  } else {
    // Add if does not exist
    wishlist.courses.push({ course: courseId, addedAt: new Date() });
    await wishlist.save();
    return ApiResponse.success(res, { inWishlist: true }, 'به علاقه‌مندی‌ها اضافه شد');
  }
});
