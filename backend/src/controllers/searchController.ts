import { Request, Response } from 'express';
import Course from '../models/Course';
import User from '../models/User';
import Category from '../models/Category';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { CourseStatus, UserRole } from '../types';
import { calculateCoursePricing } from '../services/pricing.service';
import { getActiveCampaign } from '../services/campaign.service';
import { computeBulkCourseRatings, applyRatingStatsToCourses } from '../services/courseRating.service';

export const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const { q, type } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return ApiResponse.success(res, { courses: [], instructors: [], categories: [] });
  }

  const searchQuery = q.trim();

  // Fetch active campaign once
  const { campaign: activeCampaign } = await getActiveCampaign();
  const results: Record<string, any> = {};

  // Search courses
  if (!type || type === 'courses') {
    const courses = await Course.find({
      status: CourseStatus.PUBLISHED,
      $text: { $search: searchQuery },
    })
      .populate('instructor', 'fullName avatar')
      .populate('category', 'name slug')
      .select('title slug thumbnail price averageRating totalReviews totalStudents level')
      .limit(20);

    results.courses = courses.map((course) => {
      const courseObj = course.toObject() as any;
      const pricing = calculateCoursePricing(course, new Date(), activeCampaign);
      courseObj.pricing = pricing;
      courseObj.currentPrice = pricing.currentPrice;
      courseObj.discountPercentage = pricing.currentDiscountPercent;
      // Add campaign summary for UI badge
      if (pricing.campaignApplied) {
        courseObj.activeCampaign = {
          title: activeCampaign?.title,
          bannerText: activeCampaign?.bannerText,
          endAt: activeCampaign?.endAt,
          theme: activeCampaign?.theme,
        };
      }
      return courseObj;
    });
  }

  // Search instructors
  if (!type || type === 'instructors') {
    const instructors = await User.find({
      role: UserRole.INSTRUCTOR,
      'instructorProfile.isApproved': true,
      $or: [
        { fullName: { $regex: searchQuery, $options: 'i' } },
        { 'instructorProfile.headline': { $regex: searchQuery, $options: 'i' } },
        { 'instructorProfile.expertise': { $regex: searchQuery, $options: 'i' } },
      ],
    })
      .select(
        'fullName avatar instructorProfile.headline instructorProfile.averageRating instructorProfile.totalStudents',
      )
      .limit(10);

    results.instructors = instructors;
  }

  // Search categories
  if (!type || type === 'categories') {
    const categories = await Category.find({
      isActive: true,
      name: { $regex: searchQuery, $options: 'i' },
    })
      .select('name slug icon totalCourses')
      .limit(10);

    results.categories = categories;
  }

  return ApiResponse.success(res, results);
});

export const searchCourses = asyncHandler(async (req: Request, res: Response) => {
  const {
    q,
    search,
    category,
    subCategory,
    level,
    price_min,
    price_max,
    minPrice,
    maxPrice,
    rating,
    isFree,
    sort,
    page,
    limit,
  } = req.query;

  const pageNum = Math.max(parseInt(page as string) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit as string) || 12, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  // ── نرمال‌سازی پارامترها (پشتیبانی از هر دو نام minPrice/price_min و search/q) ──
  const searchTerm =
    (typeof q === 'string' && q) || (typeof search === 'string' && search) || '';
  const parseBound = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const priceMin = parseBound(price_min ?? minPrice);
  const priceMax = parseBound(price_max ?? maxPrice);
  const minRating = parseBound(rating);
  const freeOnly = isFree === 'true';
  const sortOption = typeof sort === 'string' && sort ? sort : 'newest';

  const filter: Record<string, any> = { status: CourseStatus.PUBLISHED };

  if (searchTerm) {
    filter.$text = { $search: searchTerm };
  }
  if (category) {
    // category can be a slug or an ObjectId — resolve slug to _id
    const categoryStr = category as string;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(categoryStr);
    if (isObjectId) {
      filter.category = categoryStr;
    } else {
      const catDoc = await Category.findOne({ slug: categoryStr, isActive: true }).select('_id');
      if (catDoc) {
        filter.category = catDoc._id;
      } else {
        // No matching category — return empty result
        return ApiResponse.paginated(res, [], pageNum, limitNum, 0);
      }
    }
  }

  // فیلتر زیردسته‌بندی
  if (subCategory) {
    const subCatStr = subCategory as string;
    const isSubObjectId = /^[0-9a-fA-F]{24}$/.test(subCatStr);
    if (isSubObjectId) {
      filter.subCategory = subCatStr;
    } else {
      const subCatDoc = await Category.findOne({ slug: subCatStr, isActive: true }).select('_id');
      if (subCatDoc) {
        filter.subCategory = subCatDoc._id;
      }
    }
  }

  if (level) filter.level = level;
  if (freeOnly) filter.isFree = true;

  // ⚠️ فیلتر قیمت و امتیاز عمدتاً اینجا اعمال نمی‌شوند:
  // قیمت باید بر اساس قیمت واقعی (پس از تخفیف) و امتیاز بر اساس جدول Review
  // محاسبه شود — به «مسیر فیلتر زنده» در ادامه مراجعه کنید.

  // ── مسیر سریع: بدون فیلتر قیمت/امتیاز و بدون مرتب‌سازی مبتنی بر مقادیر محاسبه‌شده ──
  const needsLivePipeline =
    priceMin !== undefined ||
    priceMax !== undefined ||
    minRating !== undefined ||
    sortOption === 'rating' ||
    sortOption === 'price_low' ||
    sortOption === 'price_high';

  // Fetch active campaign once
  const { campaign: activeCampaign } = await getActiveCampaign();

  if (!needsLivePipeline) {
    let sortObj: Record<string, 1 | -1> = { createdAt: -1 };
    switch (sortOption) {
      case 'popular':
        sortObj = { totalStudents: -1 };
        break;
      case 'bestseller':
        sortObj = { totalRevenue: -1 };
        break;
      case 'oldest':
        sortObj = { createdAt: 1 };
        break;
      default:
        sortObj = { createdAt: -1 };
    }

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .populate('instructor', 'fullName avatar')
        .populate('category', 'name slug')
        .populate('subCategory', 'name slug')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum),
      Course.countDocuments(filter),
    ]);

    const coursesWithPricing = courses.map((course) => {
      const courseObj = course.toObject() as any;
      const pricing = calculateCoursePricing(course, new Date(), activeCampaign);
      courseObj.pricing = pricing;
      courseObj.currentPrice = pricing.currentPrice;
      courseObj.discountPercentage = pricing.currentDiscountPercent;
      // Add campaign summary for UI badge
      if (pricing.campaignApplied) {
        courseObj.activeCampaign = {
          title: activeCampaign?.title,
          bannerText: activeCampaign?.bannerText,
          endAt: activeCampaign?.endAt,
          theme: activeCampaign?.theme,
        };
      }
      return courseObj;
    });

    // ⭐ محاسبه ریتینگ واقعی از جدول Review به جای استفاده از مقادیر ذخیره‌شده
    const courseIds = coursesWithPricing.map((c) => c._id);
    const ratingMap = await computeBulkCourseRatings(courseIds);
    applyRatingStatsToCourses(coursesWithPricing, ratingMap);

    return ApiResponse.paginated(res, coursesWithPricing, pageNum, limitNum, total);
  }

  // ── مسیر فیلتر زنده: قیمت و امتیاز با مقادیر واقعی ──
  // قیمت فیلترشده باید با قیمت نمایش‌داده‌شده روی کارت (پس از تخفیف) یکی باشد
  // و امتیاز فیلترشده باید از جدول Review محاسبه شود (مقادیر ذخیره‌شده قابل‌اعتماد نیستند)
  const now = new Date();
  // activeCampaign already fetched above
  const candidates = await Course.find(filter)
    .select(
      'price discountPrice discountEndsAt discountType countdownDiscount isFree createdAt totalStudents totalRevenue averageRating',
    )
    .lean();

  const ratingMap = await computeBulkCourseRatings(
    candidates.map((c: any) => c._id),
  );

  interface ILiveCandidate {
    doc: any;
    effectivePrice: number;
    liveRating: number;
  }

  let list: ILiveCandidate[] = candidates.map((doc: any) => {
    const pricing = calculateCoursePricing(doc as any, now, activeCampaign);
    const live = ratingMap.get(doc._id.toString());
    return {
      doc,
      effectivePrice: pricing.currentPrice,
      liveRating: live?.averageRating ?? 0,
    };
  });

  // فیلتر امتیاز بر اساس میانگین واقعی (همان مقداری که روی کارت نمایش داده می‌شود)
  if (minRating !== undefined) {
    list = list.filter((c) => c.liveRating >= minRating);
  }

  // فیلتر قیمت بر اساس قیمت واقعی (پس از تخفیف)؛ دوره‌های رایگان قیمت ۰ دارند
  if (!freeOnly && (priceMin !== undefined || priceMax !== undefined)) {
    list = list.filter((c) => {
      if (priceMin !== undefined && c.effectivePrice < priceMin) return false;
      if (priceMax !== undefined && c.effectivePrice > priceMax) return false;
      return true;
    });
  }

  const comparators: Record<
    string,
    (a: ILiveCandidate, b: ILiveCandidate) => number
  > = {
    newest: (a, b) =>
      new Date(b.doc.createdAt).getTime() - new Date(a.doc.createdAt).getTime(),
    oldest: (a, b) =>
      new Date(a.doc.createdAt).getTime() - new Date(b.doc.createdAt).getTime(),
    popular: (a, b) => (b.doc.totalStudents || 0) - (a.doc.totalStudents || 0),
    bestseller: (a, b) => (b.doc.totalRevenue || 0) - (a.doc.totalRevenue || 0),
    rating: (a, b) => b.liveRating - a.liveRating,
    price_low: (a, b) => a.effectivePrice - b.effectivePrice,
    price_high: (a, b) => b.effectivePrice - a.effectivePrice,
  };
  list.sort(comparators[sortOption] || comparators.newest);

  const total = list.length;
  const pageSlice = list.slice(skip, skip + limitNum);

  if (pageSlice.length === 0) {
    return ApiResponse.paginated(res, [], pageNum, limitNum, total);
  }

  // دریافت اسناد کامل فقط برای صفحه‌ی درخواستی و بازچینش ترتیب
  const pageIds = pageSlice.map((c) => c.doc._id);
  const pageDocs = await Course.find({ _id: { $in: pageIds } })
    .populate('instructor', 'fullName avatar')
    .populate('category', 'name slug')
    .populate('subCategory', 'name slug');
  const docMap = new Map<string, any>();
  pageDocs.forEach((d) => docMap.set(d._id.toString(), d));

  const coursesWithPricing = pageSlice
    .map((c) => docMap.get(c.doc._id.toString()))
    .filter(Boolean)
    .map((doc) => {
      const courseObj = doc.toObject() as any;
      const pricing = calculateCoursePricing(doc, new Date(), activeCampaign);
      courseObj.pricing = pricing;
      courseObj.currentPrice = pricing.currentPrice;
      courseObj.discountPercentage = pricing.currentDiscountPercent;
      // Add campaign summary for UI badge
      if (pricing.campaignApplied) {
        courseObj.activeCampaign = {
          title: activeCampaign?.title,
          bannerText: activeCampaign?.bannerText,
          endAt: activeCampaign?.endAt,
          theme: activeCampaign?.theme,
        };
      }
      return courseObj;
    });

  applyRatingStatsToCourses(coursesWithPricing, ratingMap);

  return ApiResponse.paginated(res, coursesWithPricing, pageNum, limitNum, total);
});

export const getSearchSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query;

  if (!q || typeof q !== 'string' || q.trim().length < 2) {
    return ApiResponse.success(res, []);
  }

  const suggestions = await Course.find({
    status: CourseStatus.PUBLISHED,
    title: { $regex: q.trim(), $options: 'i' },
  })
    .select('title slug')
    .limit(8);

  return ApiResponse.success(
    res,
    suggestions.map((s) => ({ title: s.title, slug: s.slug })),
  );
});
