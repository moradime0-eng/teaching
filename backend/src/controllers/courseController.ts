import { courseAccess, visibleLecture } from '../utils/courseAccess';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Course from '../models/Course';
import Section from '../models/Section';
import Lecture from '../models/Lecture';
import Enrollment from '../models/Enrollment';
import Review from '../models/Review';
import User from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { CourseStatus, NotificationType } from '../types';
import { createNotification } from './notificationController';
import {
  courseRejectedTemplate,
  courseApprovedTemplate,
} from '../utils/emailTemplates';
import emailService from '../config/email';
import { invalidateCache } from '../middlewares/cache';
import path from 'path';
import fs from 'fs';
import {
  uploadBufferToCloudinary,
  deleteFromCloudinaryByUrl,
} from '../middlewares/upload';
import { uploadStreamToCloudinary } from '../config/cloudinary';
import { calculateCoursePricing } from '../services/pricing.service';
import { getActiveCampaign } from '../services/campaign.service';
import {
  computeBulkCourseRatings,
  applyRatingStatsToCourses,
  computeCourseRating,
} from '../services/courseRating.service';
import {
  sanitizeCourseMedia,
  sanitizeCourseSections,
  sanitizeLectureMedia,
} from '../utils/mediaGuard';

const generateUniqueSlugForCourse = async (
  title: string,
  excludeId?: string,
): Promise<string> => {
  const baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[\s\u200c]+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .substring(0, 150);

  let slug = baseSlug || 'course';
  let counter = 1;

  while (true) {
    const query: any = { slug };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Course.findOne(query).lean();
    if (!existing) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

const fetchCourseSections = async (courseId: string): Promise<any[]> => {
  const sections = await Section.find({ course: courseId })
    .sort({ order: 1 })
    .lean();
  if (sections.length === 0) return [];

  const sectionIds = sections.map((s) => s._id);
  const lectures = await Lecture.find({ section: { $in: sectionIds } })
    .sort({ order: 1 })
    .lean();

  const lecturesBySection = new Map<string, any[]>();
  for (const lecture of lectures) {
    const sectionId = lecture.section.toString();
    if (!lecturesBySection.has(sectionId)) {
      lecturesBySection.set(sectionId, []);
    }
    lecturesBySection.get(sectionId)!.push(lecture);
  }

  return sections.map((section) => ({
    ...section,
    lectures: lecturesBySection.get(section._id.toString()) || [],
  }));
};

// ==================== CREATE COURSE ====================
export const createCourse = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const { title, category } = req.body;
    if (!title || !category) {
      throw ApiError.badRequest('عنوان و دسته‌بندی دوره الزامی است.');
    }

    const slug = await generateUniqueSlugForCourse(title);

    const courseData: any = {
      ...req.body,
      slug,
      instructor:
        req.user.role === 'admin' && req.body.instructor
          ? req.body.instructor
          : req.user._id,
      thumbnail: req.body.thumbnail || '',
      description: req.body.description || 'توضیحات اولیه دوره پیش‌نویس',
      status: CourseStatus.DRAFT,
      totalSections: 0,
      totalLectures: 0,
      totalDuration: 0,
    };

    delete courseData.sections;

    const course = await Course.create(courseData);
    await invalidateCache([`cache:*courses*`, `cache:*search*`]);

    return ApiResponse.created(res, course, 'دوره اولیه با موفقیت ایجاد شد');
  },
);

// ==================== GET COURSE BY SLUG OR ID ====================
export const getCourseBySlug = asyncHandler(
  async (req: Request, res: Response) => {
    const { slug } = req.params;

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slug);

    const course = await (isObjectId
      ? Course.findById(slug)
      : Course.findOne({ slug })
    )
      .populate('instructor', 'fullName avatar bio instructorProfile')
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');

    if (!course) throw ApiError.notFound('دوره مورد نظر یافت نشد');

    // ⭐ دریافت ریتینگ واقعی از Review collection
    const liveRating = await computeCourseRating(course._id);

    const reviews = await Review.find({
      course: course._id,
      isHidden: { $ne: true },
    })
      .populate('user', 'fullName avatar')
      .sort({ createdAt: -1 })
      .limit(10);

    const sectionsWithLectures = await fetchCourseSections(
      course._id.toString(),
    );

    // ─── ۱. دوره منتشر شده ───
    if (course.status === CourseStatus.PUBLISHED) {
      const access = await courseAccess(req, course._id);
      const isAdmin = req.user?.role === 'admin';

      // 🔒 مالک دوره و ادمین می‌توانند لینک خام ویدیوی معرفی را ببینند (ویرایشگر)
      // ولی هیچ کاربر دیگری (حتی دانشجوی ثبت‌نام‌شده) لینک خام را دریافت نمی‌کند.
      const instructorRef = (course.instructor as any)?._id ?? course.instructor;
      const isOwner = instructorRef?.toString() === req.user?._id?.toString();
      const allowRawPromo = isAdmin || isOwner;

      const courseObj = sanitizeCourseMedia(course.toObject() as any, allowRawPromo);

      // ⭐ اعمال ریتینگ واقعی
      courseObj.averageRating = liveRating.averageRating;
      courseObj.totalReviews = liveRating.totalReviews;
      courseObj.ratingDistribution = liveRating.ratingDistribution;

      // Fetch active campaign for this request
      const { campaign: activeCampaign } = await getActiveCampaign();
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

      courseObj.sections = sectionsWithLectures.map((sec: any) => ({
        ...sec,
        lectures: (sec.lectures || []).map((lec: any) => visibleLecture(lec, access))
          .filter(Boolean).map((lec: any) => access.manager ? lec : sanitizeLectureMedia(lec)),
      }));

      courseObj.reviews = reviews;
      return ApiResponse.success(res, courseObj);
    }

    // ─── ۲. دوره منتشر نشده ───
    const instructorId =
      course.instructor && typeof course.instructor === 'object'
        ? (course.instructor as any)._id?.toString()
        : (course.instructor as any)?.toString();

    const isOwner = req.user && instructorId === req.user._id.toString();
    const isAdmin = req.user && req.user.role === 'admin';

    if (isOwner || isAdmin) {
      const courseObj = course.toObject() as any;

      // ⭐ اعمال ریتینگ واقعی
      courseObj.averageRating = liveRating.averageRating;
      courseObj.totalReviews = liveRating.totalReviews;
      courseObj.ratingDistribution = liveRating.ratingDistribution;

      courseObj.sections = sectionsWithLectures;
      courseObj.reviews = reviews;

      // Fetch active campaign for this request
      const { campaign: activeCampaign } = await getActiveCampaign();
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

      return ApiResponse.success(res, courseObj);
    }

    throw ApiError.notFound(
      'دوره مورد نظر یافت نشد یا هنوز منتشر نشده است',
    );
  },
);

// ==================== GET COURSE BY ID ====================
export const getCourseById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const course = await Course.findById(id)
      .populate('instructor', 'fullName avatar')
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');

    if (!course) throw ApiError.notFound('دوره یافت نشد');

    // Editing details are private for published courses too.
    {
      const instructorRef = (course.instructor as any)?._id ?? course.instructor;
      const isOwner =
        instructorRef?.toString() === req.user?._id?.toString();
      const isAdmin = req.user?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: you can only view your own unpublished courses',
        });
      }
    }

    if (course.status !== 'published' && !req.user) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const courseObj = sanitizeCourseMedia(course.toObject() as any, true);
    courseObj.sections = await fetchCourseSections(id);

    // ⭐ اعمال ریتینگ واقعی
    const liveRating = await computeCourseRating(course._id);
    courseObj.averageRating = liveRating.averageRating;
    courseObj.totalReviews = liveRating.totalReviews;
    courseObj.ratingDistribution = liveRating.ratingDistribution;

    // Fetch active campaign for this request
    const { campaign: activeCampaign } = await getActiveCampaign();
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

    return ApiResponse.success(res, courseObj);
  },
);

// ==================== UPDATE COURSE ====================
export const updateCourse = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!req.user) throw ApiError.unauthorized();

    const course = await Course.findById(id);
    if (!course) throw ApiError.notFound('دوره یافت نشد');

    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      throw ApiError.forbidden('شما اجازه ویرایش این دوره را ندارید');
    }

    const ALLOWED_INSTRUCTOR_FIELDS = [
      'title',
      'subtitle',
      'description',
      'shortDescription',
      'thumbnail',
      'promoVideo',
      'promoVideoType',
      'promoVideoUrl',
      'category',
      'subCategory',
      'level',
      'language',
      'price',
      'discountPrice',
      'discountEndsAt',
      'discountType',
      'countdownDiscount',
      'isFree',
      'requirements',
      'requirementCourses',
      'learningOutcomes',
      'targetAudience',
      'tags',
      'hasCertificate',
      'hasLifetimeAccess',
      'hasSupport',
      'maxStudents',
      'installmentEnabled',
      'installmentCount',
      'metaTitle',
      'metaDescription',
      'metaKeywords',
    ];

    const ALLOWED_ADMIN_ONLY_FIELDS = [
      'status',
      'rejectionReason',
      'isFeatured',
      'isBestseller',
    ];

    const isAdmin = req.user.role === 'admin';
    const allowedFields = isAdmin
      ? [...ALLOWED_INSTRUCTOR_FIELDS, ...ALLOWED_ADMIN_ONLY_FIELDS]
      : ALLOWED_INSTRUCTOR_FIELDS;

    const updateData: any = {};
    const unsetData: any = {};

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        if (req.body[key] === null) {
          unsetData[key] = 1;
        } else {
          updateData[key] = req.body[key];
        }
      }
    }

    const rejectedFields = Object.keys(req.body).filter(
      (k) =>
        !allowedFields.includes(k) &&
        !['_id', 'sections', 'slug'].includes(k),
    );
    if (rejectedFields.length > 0) {
      console.warn(
        `⚠️ [Security] User ${req.user._id} tried to update forbidden fields on course ${id}:`,
        rejectedFields,
      );
    }

    if (updateData.title && updateData.title !== course.title) {
      updateData.slug = await generateUniqueSlugForCourse(
        updateData.title,
        id,
      );
    }

    const oldStatus = course.status;
    const courseDoc = course as any;
    Object.keys(updateData).forEach((key) => {
      courseDoc[key] = updateData[key];
    });

    Object.keys(unsetData).forEach((key) => {
      courseDoc[key] = undefined;
      if (courseDoc.set) {
        courseDoc.set(key, undefined, { strict: false });
      }
    });

    if (updateData.discountType === 'none') {
      courseDoc.discountPrice = undefined;
      courseDoc.discountEndsAt = undefined;
      courseDoc.countdownDiscount = undefined;
    } else if (updateData.discountType === 'manual') {
      courseDoc.countdownDiscount = undefined;
    } else if (updateData.discountType === 'countdown') {
      courseDoc.discountPrice = undefined;
      courseDoc.discountEndsAt = undefined;
    }

    if (updateData.isFree === true) {
      courseDoc.price = 0;
      courseDoc.discountPrice = undefined;
      courseDoc.discountEndsAt = undefined;
      courseDoc.discountType = 'none';
      courseDoc.countdownDiscount = undefined;
    }

    course.lastUpdatedContent = new Date();
    await course.save();

    const unsetOperation: Record<string, 1> = {};

    Object.keys(unsetData).forEach((key) => {
      unsetOperation[key] = 1;
    });

    if (updateData.discountType === 'none' || updateData.isFree === true) {
      unsetOperation.discountPrice = 1;
      unsetOperation.discountEndsAt = 1;
      unsetOperation.countdownDiscount = 1;
    } else if (updateData.discountType === 'manual') {
      unsetOperation.countdownDiscount = 1;
    } else if (updateData.discountType === 'countdown') {
      unsetOperation.discountPrice = 1;
      unsetOperation.discountEndsAt = 1;
    }

    if (Object.keys(unsetOperation).length > 0) {
      await Course.updateOne({ _id: id }, { $unset: unsetOperation });
    }

    // اطلاع‌رسانی رد یا تأیید
    if (req.user.role === 'admin' && updateData.status) {
      const newStatus = updateData.status;

      if (oldStatus !== newStatus) {
        const instructorId = course.instructor.toString();
        const courseUrl = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/instructor/course-builder/${course._id}`;

        if (newStatus === CourseStatus.REJECTED) {
          const rejectionReason =
            updateData.rejectionReason || 'دلیلی ذکر نشده است';

          await createNotification({
            recipient: instructorId,
            sender: req.user._id.toString(),
            type: NotificationType.COURSE_REJECTED,
            title: '❌ دوره شما تأیید نشد',
            message: `دوره "${course.title}" توسط مدیر بازبینی و رد شد. دلیل: ${rejectionReason}`,
            data: { courseId: course._id, rejectionReason },
            link: `/instructor/course-builder/${course._id}`,
          });

          try {
            const instructor = await User.findById(instructorId).select(
              'fullName email',
            );
            if (instructor?.email) {
              await emailService.sendEmail({
                to: instructor.email,
                subject: `❌ دوره "${course.title}" تأیید نشد`,
                html: courseRejectedTemplate(
                  instructor.fullName || 'مدرس عزیز',
                  course.title,
                  rejectionReason,
                  courseUrl,
                ),
              });
            }
          } catch (emailErr) {
            console.error('❌ خطا در ارسال ایمیل رد دوره:', emailErr);
          }
        }

        if (newStatus === CourseStatus.PUBLISHED) {
          await createNotification({
            recipient: instructorId,
            sender: req.user._id.toString(),
            type: NotificationType.COURSE_APPROVED,
            title: '🎉 دوره شما تأیید و منتشر شد!',
            message: `دوره "${course.title}" با موفقیت تأیید و منتشر شد.`,
            data: { courseId: course._id },
            link: `/course/${course.slug}`,
          });

          try {
            const instructor = await User.findById(instructorId).select(
              'fullName email',
            );
            if (instructor?.email) {
              await emailService.sendEmail({
                to: instructor.email,
                subject: `🎉 دوره "${course.title}" تأیید شد!`,
                html: courseApprovedTemplate(
                  instructor.fullName || 'مدرس عزیز',
                  course.title,
                  courseUrl,
                ),
              });
            }
          } catch (emailErr) {
            console.error('❌ خطا در ارسال ایمیل تأیید دوره:', emailErr);
          }
        }
      }
    }

    const courseSlug = course.slug;
    await invalidateCache([
      `cache:*courses*`,
      `cache:*${courseSlug}*`,
      `cache:*search*`,
    ]);

    const freshCourse = await Course.findById(id)
      .populate('instructor', 'fullName avatar')
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug');

    if (!freshCourse) throw ApiError.notFound('دوره یافت نشد');

    const courseObj = freshCourse.toObject() as any;

    // ⭐ اعمال ریتینگ واقعی
    const liveRating = await computeCourseRating(freshCourse._id);
    courseObj.averageRating = liveRating.averageRating;
    courseObj.totalReviews = liveRating.totalReviews;
    courseObj.ratingDistribution = liveRating.ratingDistribution;

    const pricing = calculateCoursePricing(freshCourse);
    courseObj.pricing = pricing;
    courseObj.currentPrice = pricing.currentPrice;
    courseObj.discountPercentage = pricing.currentDiscountPercent;

    return ApiResponse.success(
      res,
      courseObj,
      'دوره با موفقیت بروزرسانی شد',
    );
  },
);

// ==================== SUBMIT FOR REVIEW ====================
export const submitForReview = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const course = await Course.findById(id);
    if (!course) throw ApiError.notFound('دوره یافت نشد');

    if (
      req.user &&
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      throw ApiError.forbidden('شما اجازه ارسال این دوره را ندارید');
    }

    const sections = await Section.find({ course: id });
    if (sections.length === 0) {
      throw ApiError.badRequest('دوره باید حداقل دارای یک فصل باشد');
    }

    const sectionIds = sections.map((s) => s._id);
    const totalLectures = await Lecture.countDocuments({
      section: { $in: sectionIds },
    });
    if (totalLectures === 0) {
      throw ApiError.badRequest(
        'سرفصل‌های دوره باید حداقل دارای یک درس باشند',
      );
    }

    course.totalSections = sections.length;
    course.totalLectures = totalLectures;

    if (req.user && req.user.role === 'admin') {
      course.status = CourseStatus.PUBLISHED;
      course.publishedAt = new Date();
      await course.save();
      return ApiResponse.success(res, course, 'دوره با موفقیت منتشر شد');
    }

    course.status = CourseStatus.PENDING;
    await course.save();

    return ApiResponse.success(res, course, 'دوره برای بازبینی ارسال شد');
  },
);

// ==================== LIST COURSES ====================
export const listCourses = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit, skip, sort } = getPaginationOptions(req);

    // Fetch active campaign once for all courses in this request
    const { campaign: activeCampaign } = await getActiveCampaign();

    const allowedStatuses = [
      CourseStatus.DRAFT,
      CourseStatus.PENDING,
      CourseStatus.PUBLISHED,
      CourseStatus.REJECTED,
      CourseStatus.ARCHIVED,
    ];
    const requestedStatus = req.query.status as string;
    const isAdmin = req.user && req.user.role === 'admin';

    let statusFilter = CourseStatus.PUBLISHED;
    if (
      requestedStatus &&
      allowedStatuses.includes(requestedStatus as CourseStatus)
    ) {
      if (isAdmin || requestedStatus === CourseStatus.PUBLISHED) {
        statusFilter = requestedStatus as CourseStatus;
      }
    }
    const query: Record<string, any> = { status: statusFilter };

    if (req.query.category) query.category = req.query.category;
    if (req.query.level) query.level = req.query.level;
    if (req.query.isFree) query.isFree = req.query.isFree === 'true';

    if (req.query.tags) {
      const tags = (req.query.tags as string)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        query.tags = { $in: tags };
      }
    }

    if (req.query.price_min || req.query.price_max) {
      query.price = {};
      if (req.query.price_min)
        query.price.$gte = Number(req.query.price_min);
      if (req.query.price_max)
        query.price.$lte = Number(req.query.price_max);
    }

    if (req.query.search) {
      query.$text = { $search: req.query.search as string };
    }

    const courses = await Course.find(query)
      .populate('instructor', 'fullName avatar')
      .populate('category', 'name slug')
      .populate('subCategory', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const coursesWithPricing = courses.map((course) => {
      // 🔒 لینک خام ویدیوی معرفی (Arvan/S3) نباید در پاسخ عمومی بیاید
      const courseObj = sanitizeCourseMedia(course.toObject() as any);
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

    // ⭐ محاسبه ریتینگ واقعی از جدول Review
    const courseIds = coursesWithPricing.map((c) => c._id);
    const ratingMap = await computeBulkCourseRatings(courseIds);
    applyRatingStatsToCourses(coursesWithPricing, ratingMap);

    const total = await Course.countDocuments(query);

    return ApiResponse.paginated(
      res,
      coursesWithPricing,
      page,
      limit,
      total,
    );
  },
);

// ==================== GET RELATED COURSES ====================
export const getRelatedCourses = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const course = await Course.findById(id).lean();
    if (!course) throw ApiError.notFound('دوره مورد نظر یافت نشد');

    const relatedCourses = await Course.find({
      _id: { $ne: id },
      category: course.category,
      status: CourseStatus.PUBLISHED,
    })
      .populate('instructor', 'fullName avatar')
      .select(
        'title slug thumbnail price discountPrice discountType countdownDiscount discountEndsAt isFree averageRating totalReviews totalStudents instructor category',
      )
      .sort({ averageRating: -1, totalStudents: -1 })
      .limit(6);

    // Fetch active campaign for this request
    const { campaign: activeCampaign } = await getActiveCampaign();

    const relatedWithPricing = relatedCourses.map((c) => {
      const courseObj = c.toObject() as any;
      const pricing = calculateCoursePricing(c, new Date(), activeCampaign);
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

    // ⭐ محاسبه ریتینگ واقعی از جدول Review
    const relIds = relatedWithPricing.map((c) => c._id);
    const relRatingMap = await computeBulkCourseRatings(relIds);
    applyRatingStatsToCourses(relatedWithPricing, relRatingMap);

    return ApiResponse.success(
      res,
      relatedWithPricing,
      'دوره‌های مرتبط با موفقیت دریافت شدند',
    );
  },
);

// ==================== UPLOAD THUMBNAIL ====================
export const uploadThumbnail = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!req.user) throw ApiError.unauthorized();

    const course = await Course.findById(id);
    if (!course) throw ApiError.notFound('دوره یافت نشد');

    if (
      course.instructor.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      throw ApiError.forbidden('شما اجازه ویرایش این دوره را ندارید');
    }

    if (!req.file) {
      throw ApiError.badRequest('فایل تصویر آپلود نشده است');
    }

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw ApiError.badRequest(
        'فرمت فایل مجاز نیست. فقط JPEG, PNG, GIF, WebP مجاز هستند',
      );
    }

    if (req.file.size > 2 * 1024 * 1024) {
      throw ApiError.badRequest(
        'حجم فایل نباید بیشتر از ۲ مگابایت باشد',
      );
    }

    if (course.thumbnail) {
      if (course.thumbnail.includes('cloudinary.com')) {
        deleteFromCloudinaryByUrl(course.thumbnail, 'image').catch(
          () => {},
        );
      } else if (course.thumbnail.startsWith('/uploads/')) {
        const oldPath = path.join(
          __dirname,
          '..',
          '..',
          course.thumbnail,
        );
        fs.promises.unlink(oldPath).catch(() => {});
      }
    }

    const folder = 'thumbnails';
    let thumbnailUrl: string;

    if (req.file.buffer) {
      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        folder,
        'image',
      );
      thumbnailUrl = result.url;
    } else if (req.file.path) {
      try {
        const result = await uploadStreamToCloudinary(
          req.file.path,
          'thumbnails',
          'image',
          '',
        );
        thumbnailUrl = result.url;
      } finally {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
    } else {
      throw ApiError.badRequest('فایل تصویر آپلود نشده است');
    }

    course.thumbnail = thumbnailUrl;
    await course.save();

    return ApiResponse.success(
      res,
      { thumbnail: thumbnailUrl, thumbnailUrl },
      'تصویر کاور با موفقیت آپلود شد',
    );
  },
);

// ==================== DELETE COURSE (ADMIN ONLY) ====================
export const deleteCourse = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const courseId = new mongoose.Types.ObjectId(id);
    if (!req.user) throw ApiError.unauthorized();

    // Only admins can delete courses
    if (req.user.role !== 'admin') {
      throw ApiError.forbidden('فقط ادمین‌ها می‌توانند دوره را حذف کنند');
    }

    const course = await Course.findById(courseId);
    if (!course) throw ApiError.notFound('دوره یافت نشد');

    // Delete related data
    // 1. Delete sections and lectures
    const sections = await Section.find({ course: courseId });
    const sectionIds = sections.map((s) => s._id);
    
    if (sectionIds.length > 0) {
      await Lecture.deleteMany({ section: { $in: sectionIds } });
      await Section.deleteMany({ course: courseId });
    }

    // 2. Delete enrollments
    await Enrollment.deleteMany({ course: courseId });

    // 3. Delete reviews
    await Review.deleteMany({ course: courseId });

    // 4. Delete discussions
    const Discussion = (await import('../models/Discussion')).default;
    await Discussion.deleteMany({ course: courseId });

    // 5. Delete progress records
    const Progress = (await import('../models/Progress')).default;
    await Progress.deleteMany({ course: courseId });

    // 6. Delete certificates
    const Certificate = (await import('../models/Certificate')).default;
    await Certificate.deleteMany({ course: courseId });

    // 7. Delete payments related to this course
    const Payment = (await import('../models/Payment')).default;
    await Payment.deleteMany({ course: courseId });

    // 8. Delete wallet transactions related to this course
    const WalletTransaction = (await import('../models/WalletTransaction')).default;
    await WalletTransaction.deleteMany({ relatedCourse: courseId });

    // 9. Delete tickets related to this course
    const Ticket = (await import('../models/Ticket')).default;
    await Ticket.deleteMany({ relatedCourse: courseId });

    // 10. Remove course from wishlists
    const Wishlist = (await import('../models/Wishlist')).default;
    await Wishlist.updateMany(
      { courses: courseId },
      { $pull: { courses: courseId } }
    );

    // 11. Remove course from carts
    const Cart = (await import('../models/Cart')).default;
    await Cart.updateMany(
      { 'items.course': courseId },
      { $pull: { items: { course: courseId } } }
    );

    // 12. Remove course from learning paths
    const LearningPath = (await import('../models/LearningPath')).default;
    await LearningPath.updateMany(
      { 'stages.course': courseId },
      { $pull: { 'stages.$.course': courseId } }
    );
    await LearningPath.updateMany(
      { 'stages.prerequisites': courseId },
      { $pull: { 'stages.$.prerequisites': courseId } }
    );

    // 13. Remove course from coupons
    const Coupon = (await import('../models/Coupon')).default;
    await Coupon.updateMany(
      { applicableCourses: courseId },
      { $pull: { applicableCourses: courseId } }
    );
    await Coupon.updateMany(
      { excludedCourses: courseId },
      { $pull: { excludedCourses: courseId } }
    );

    // 14. Remove course from campaigns
    const Campaign = (await import('../models/Campaign')).default;
    await Campaign.updateMany(
      { applicableCourses: courseId },
      { $pull: { applicableCourses: courseId } }
    );

    // 15. Delete course thumbnail from Cloudinary/local storage
    if (course.thumbnail) {
      if (course.thumbnail.includes('cloudinary.com')) {
        deleteFromCloudinaryByUrl(course.thumbnail, 'image').catch(() => {});
      } else if (course.thumbnail.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', '..', course.thumbnail);
        fs.promises.unlink(oldPath).catch(() => {});
      }
    }

    // 16. Delete promo video if uploaded
    if (course.promoVideo && course.promoVideoType === 'upload') {
      if (course.promoVideo.includes('cloudinary.com')) {
        deleteFromCloudinaryByUrl(course.promoVideo, 'video').catch(() => {});
      } else if (course.promoVideo.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, '..', '..', course.promoVideo);
        fs.promises.unlink(oldPath).catch(() => {});
      }
    }

    // 17. Finally delete the course itself
    await Course.findByIdAndDelete(courseId);

    // Invalidate cache
    await invalidateCache([
      `cache:*courses*`,
      `cache:*${course.slug}*`,
      `cache:*search*`,
    ]);

    return ApiResponse.success(res, null, 'دوره و تمام داده‌های مرتبط با موفقیت حذف شد');
  },
);