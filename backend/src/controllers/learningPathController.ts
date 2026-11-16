// backend/src/controllers/learningPathController.ts

import { Request, Response } from 'express';
import LearningPath from '../models/LearningPath';
import LearningPathEnrollment from '../models/LearningPathEnrollment';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { uploadToCloudinary } from '../config/cloudinary';
import { LearningPathProgressService } from '../services/learningPathProgress.service';
import fs from 'fs';

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function isValidMongoId(id: any): boolean {
  if (!id) return false;
  try {
    const str = typeof id === 'object' && id._id ? String(id._id) : String(id);
    return /^[0-9a-fA-F]{24}$/.test(str);
  } catch {
    return false;
  }
}

function cleanId(id: any): string | undefined {
  if (!id) return undefined;
  try {
    const str = typeof id === 'object' && id._id ? String(id._id) : String(id);
    return /^[0-9a-fA-F]{24}$/.test(str) ? str : undefined;
  } catch {
    return undefined;
  }
}

// ✅ FIX: Escape regex for safe search
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ✅ FIX: Whitelist of allowed sort fields
const ALLOWED_SORTS = new Set([
  '-createdAt', 'createdAt',
  '-enrolledStudents', 'enrolledStudents',
  'title', '-title',
  '-totalCourses', 'totalCourses',
  '-averageRating', 'averageRating',
  'displayOrder', '-displayOrder',
]);
function safeSort(sort: any, fallback = '-createdAt'): string {
  return typeof sort === 'string' && ALLOWED_SORTS.has(sort) ? sort : fallback;
}


function safePagination(query: any, defaultLimit = 12): { page: number; limit: number; skip: number } {
  const rawPage = parseInt(String(query.page ?? ''), 10);
  const rawLimit = parseInt(String(query.limit ?? ''), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * پاک‌سازی مراحل ورودی از کاربر
 */
function sanitizeStages(stages: any[]): any[] {
  if (!Array.isArray(stages)) return [];

  return stages.map((s, stageIndex) => {
    const sanitizedCourses = Array.isArray(s.courses)
      ? s.courses
          .map((cn: any) => {
            const courseId = cleanId(cn.course);
            if (!courseId) return null;

            return {
              course: courseId,
              order: typeof cn.order === 'number' ? cn.order : 0,
              isRequired: cn.isRequired !== false,
              // ✅ FIX #5: isUnlocked حذف شد
              prerequisites: Array.isArray(cn.prerequisites)
                ? cn.prerequisites.map((p: any) => cleanId(p)).filter(Boolean)
                : [],
              estimatedDuration: Number(cn.estimatedDuration) || 0,
              customTitle: cn.customTitle?.trim() || undefined,
              customDescription: cn.customDescription?.trim() || undefined,
            };
          })
          .filter(Boolean)
      : [];

    const stage: any = {
      title: (s.title || `مرحله ${stageIndex + 1}`).trim().slice(0, 100),
      description: (s.description || '').slice(0, 10000),
      icon: s.icon || '📚',
      color: s.color || '#a435f0',
      order: typeof s.order === 'number' ? s.order : stageIndex,
      courses: sanitizedCourses,
    };

    if (s.milestone?.title?.trim()) {
      stage.milestone = {
        title: s.milestone.title.trim().slice(0, 100),
        description: (s.milestone.description || '').slice(0, 500),
        badge: s.milestone.badge || '🏆',
      };
    }

    if (s._id && isValidMongoId(s._id)) {
      stage._id = cleanId(s._id);
    }

    return stage;
  });
}

/**
 * ⚠️ FIX MEDIUM: پس از هر تغییر در ساختار مراحل (افزودن/حذف/جابه‌جایی دوره)،
 * شاخص مرحله‌ی جاری و درصد پیشرفت ثبت‌نام‌کننده‌ها به ایندکس نامعتبر اشاره می‌کرد.
 * این تابع همه‌ی ثبت‌نام‌های آن مسیر را دوباره محاسبه می‌کند.
 */
async function syncEnrollmentsAfterStageChange(learningPathId: string) {
  try {
    const enrollments = await LearningPathEnrollment.find({ learningPath: learningPathId });
    for (const enrollment of enrollments) {
      await LearningPathProgressService.recalculateProgress(enrollment._id);
    }
  } catch (err: any) {
    // نباید باعث شکست عملیات اصلی شود؛ فقط لاگ می‌کنیم
    console.error('❌ [syncEnrollmentsAfterStageChange]:', err.message);
  }
}

/**
 * ⚠️ FIX SECURITY: ویلست فیلدها برای عملیات مرحله (جلوگیری از Mass Assignment)
 */
function sanitizeStageInput(body: any): any {
  const allowed = ['title', 'description', 'icon', 'color'];
  const stage: any = {};
  for (const key of allowed) {
    if (body[key] !== undefined) stage[key] = body[key];
  }
  if (body.title) stage.title = String(body.title).trim().slice(0, 100);
  if (body.description) stage.description = String(body.description).slice(0, 10000);

  if (body.milestone?.title?.trim()) {
    stage.milestone = {
      title: String(body.milestone.title).trim().slice(0, 100),
      description: String(body.milestone.description || '').slice(0, 500),
      badge: body.milestone.badge || '🏆',
    };
  }
  return stage;
}

// ════════════════════════════════════════════
// POST /api/v1/learning-paths
// ════════════════════════════════════════════
export const createLearningPath = asyncHandler(async (req: Request, res: Response) => {
  const { stages, coverImage, category, ...rest } = req.body;

  const pathData: any = {
    ...rest,
    createdBy: (req as any).user._id,
    status: 'draft',
  };

  const validCategory = cleanId(category);
  if (validCategory) pathData.category = validCategory;
  else delete pathData.category;

  if (typeof coverImage === 'string' && coverImage.trim()) {
    pathData.coverImage = coverImage.trim();
  } else {
    delete pathData.coverImage;
  }

  if (Array.isArray(stages) && stages.length > 0) {
    pathData.stages = sanitizeStages(stages);
  } else {
    pathData.stages = [];
  }

  // ✅ Strip protected fields
  const protectedFields = [
    '_id', 'slug', 'enrolledStudents', 'completionRate', 'averageRating',
    'totalRatings', 'totalCourses', 'estimatedTotalDuration',
    'publishedAt', 'createdAt', 'updatedAt', 'status',
  ];
  protectedFields.forEach((f) => delete pathData[f]);
  pathData.status = 'draft';

  let path;
  try {
    path = await LearningPath.create(pathData);
  } catch (createErr: any) {
    if (createErr.name === 'ValidationError') {
      const msgs = Object.values(createErr.errors).map((e: any) => e.message);
      throw ApiError.badRequest(msgs.join('، '));
    }
    throw ApiError.badRequest(createErr.message || 'خطا در ایجاد مسیر یادگیری');
  }

  const populated = await LearningPath.findById(path._id)
    .populate('category', 'name slug icon')
    .populate('stages.courses.course', 'title slug thumbnail')
    .maxTimeMS(10000);

  return ApiResponse.created(res, populated, 'مسیر یادگیری با موفقیت ایجاد شد');
});

// ════════════════════════════════════════════
// PUT /api/v1/learning-paths/:id
// ✅ FIX #35: Use findById + save() to trigger pre('save') hook
// ✅ FIX #9: Strip status field to prevent bypass
// ════════════════════════════════════════════
export const updateLearningPath = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) {
    throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  }

  const { stages, coverImage, category, ...rest } = req.body;
  const updateData: any = { ...rest };

  // ✅ Strip protected fields (including status to prevent publish bypass)
  const protectedFields = [
    '_id', 'slug', 'createdBy', 'enrolledStudents', 'completionRate',
    'averageRating', 'totalRatings', 'totalCourses', 'estimatedTotalDuration',
    'publishedAt', 'createdAt', 'updatedAt', 'status',
  ];
  protectedFields.forEach((f) => delete updateData[f]);

  const validCategory = cleanId(category);
  if (validCategory) {
    updateData.category = validCategory;
  } else if (category === '' || category === null) {
    updateData.category = null;
  } else {
    delete updateData.category;
  }

  if (typeof coverImage === 'string') {
    updateData.coverImage = coverImage.trim() || undefined;
  }

  if (Array.isArray(stages)) {
    updateData.stages = sanitizeStages(stages);
  }

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یادگیری یافت نشد');

  try {
    Object.assign(path, updateData);
    await path.save();
  } catch (err: any) {
    if (err.name === 'ValidationError') {
      const msgs = Object.values(err.errors).map((e: any) => e.message);
      throw ApiError.badRequest(msgs.join('، '));
    }
    if (err.name === 'CastError') {
      throw ApiError.badRequest(`شناسه نامعتبر: ${err.value}`);
    }
    throw ApiError.badRequest(err.message || 'خطا در به‌روزرسانی');
  }

  const populated = await LearningPath.findById(path._id)
    .populate('category', 'name slug icon')
    .populate('stages.courses.course', 'title slug thumbnail')
    .maxTimeMS(15000);

  return ApiResponse.success(res, populated, 'مسیر یادگیری به‌روزرسانی شد');
});

// ════════════════════════════════════════════
// GET /api/v1/learning-paths
// ✅ FIX #1: Replace $text with $regex
// ✅ FIX #15: Support difficulty and hasCertificate filters server-side
// ✅ FIX #20: Whitelist sort field
// ════════════════════════════════════════════
export const getAllLearningPaths = asyncHandler(async (req: Request, res: Response) => {
  const { category, difficulty, search, sort, isFeatured, hasCertificate } = req.query;

  const filter: any = { status: 'published' };
  if (category && isValidMongoId(category)) filter.category = category;
  if (difficulty && ['beginner', 'intermediate', 'advanced', 'mixed'].includes(difficulty as string)) {
    filter.difficulty = difficulty;
  }
  if (hasCertificate === 'true') filter.hasCertificate = true;
  if (isFeatured === 'true') filter.isFeatured = true;

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeRegex(search.trim());
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { shortDescription: { $regex: escaped, $options: 'i' } },
      { subtitle: { $regex: escaped, $options: 'i' } },
    ];
  }

  const { page, limit, skip } = safePagination(req.query, 12);

  const [paths, total] = await Promise.all([
    LearningPath.find(filter)
      .populate('category', 'name slug icon')
      .populate('stages.courses.course', 'title slug thumbnail price averageRating totalStudents')
      .populate('createdBy', 'fullName avatar')
      .sort(safeSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    LearningPath.countDocuments(filter),
  ]);

  return ApiResponse.paginated(res, paths, page, limit, total, 'مسیرهای یادگیری دریافت شد');
});

// ════════════════════════════════════════════
// GET /api/v1/learning-paths/stats/overview
// ✅ FIX #2: آمار کلی کاتالوگ بدون فیلتر، برای هیرو صفحه
// ════════════════════════════════════════════
export const getPublicStatsOverview = asyncHandler(async (req: Request, res: Response) => {
  const [agg] = await LearningPath.aggregate([
    { $match: { status: 'published' } },
    {
      $group: {
        _id: null,
        totalPaths: { $sum: 1 },
        totalCourses: { $sum: '$totalCourses' },
        totalDuration: { $sum: '$estimatedTotalDuration' },
        certifiedPaths: { $sum: { $cond: ['$hasCertificate', 1, 0] } },
      },
    },
  ]);

  return ApiResponse.success(
    res,
    {
      totalPaths: agg?.totalPaths || 0,
      totalCourses: agg?.totalCourses || 0,
      totalDuration: agg?.totalDuration || 0,
      certifiedPaths: agg?.certifiedPaths || 0,
    },
    'آمار مسیرهای یادگیری',
  );
});

// ════════════════════════════════════════════
// GET /api/v1/learning-paths/:slug
// ✅ FIX #2: Now uses optionalAuth middleware (see routes file)
// ════════════════════════════════════════════
export const getLearningPathBySlug = asyncHandler(async (req: Request, res: Response) => {
  const path = await LearningPath.findOne({ slug: req.params.slug, status: 'published' })
    .populate('category', 'name slug icon')
    .populate({
      path: 'stages.courses.course',
      select:
        'title slug thumbnail price discountPrice isFree averageRating totalStudents totalDuration totalLectures instructor level',
      populate: { path: 'instructor', select: 'fullName avatar' },
    })
    .populate('createdBy', 'fullName avatar')
    .lean();

  if (!path) throw ApiError.notFound('مسیر یادگیری یافت نشد');

  let enrollment = null;
  if ((req as any).user?._id) {
    enrollment = await LearningPathEnrollment.findOne({
      user: (req as any).user._id,
      learningPath: path._id,
    }).lean();
  }

  return ApiResponse.success(
    res,
    { ...path, userEnrollment: enrollment },
    'جزئیات مسیر یادگیری دریافت شد',
  );
});

// ════════════════════════════════════════════
// GET /api/v1/learning-paths/admin/all
// ✅ FIX #1: $regex instead of $text
// ════════════════════════════════════════════
export const getAllLearningPathsAdmin = asyncHandler(async (req: Request, res: Response) => {
  const { status, category, difficulty, search, sort } = req.query;

  const filter: any = {};
  if (status) filter.status = status;
  if (category && isValidMongoId(category)) filter.category = category;
  if (difficulty) filter.difficulty = difficulty;

  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeRegex(search.trim());
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { shortDescription: { $regex: escaped, $options: 'i' } },
      { subtitle: { $regex: escaped, $options: 'i' } },
    ];
  }

  const { page, limit, skip } = safePagination(req.query, 12);

  const [paths, total] = await Promise.all([
    LearningPath.find(filter)
      .populate('category', 'name slug icon')
      .populate('stages.courses.course', 'title slug thumbnail price averageRating totalStudents')
      .populate('createdBy', 'fullName avatar')
      .sort(safeSort(sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    LearningPath.countDocuments(filter),
  ]);

  return ApiResponse.paginated(res, paths, page, limit, total, 'لیست مسیرهای ادمین دریافت شد');
});

// ════════════════════════════════════════════
// GET /api/v1/learning-paths/admin/:id
// ════════════════════════════════════════════
export const getLearningPathById = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) {
    throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  }

  const path = await LearningPath.findById(req.params.id)
    .populate('category', 'name slug icon')
    .populate({
      path: 'stages.courses.course',
      select:
        'title slug thumbnail price discountPrice isFree averageRating totalStudents totalDuration totalLectures instructor level',
      populate: { path: 'instructor', select: 'fullName avatar' },
    })
    .populate('createdBy', 'fullName avatar');

  if (!path) throw ApiError.notFound('مسیر یادگیری یافت نشد');

  return ApiResponse.success(res, path, 'جزئیات مسیر یادگیری دریافت شد');
});

// ════════════════════════════════════════════
// DELETE /api/v1/learning-paths/:id
// ✅ FIX #5: Cascade delete enrollments
// ════════════════════════════════════════════
export const deleteLearningPath = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) {
    throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  }
  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یادگیری یافت نشد');

  // Cascade cleanup
  await LearningPathEnrollment.deleteMany({ learningPath: req.params.id });
  await path.deleteOne();

  return ApiResponse.success(res, null, 'مسیر و ثبت‌نام‌های مرتبط حذف شد');
});

// ════════════════════════════════════════════
// PATCH /api/v1/learning-paths/:id/publish
// ════════════════════════════════════════════
export const publishLearningPath = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) {
    throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  }

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یادگیری یافت نشد');

  if (!path.title?.trim()) throw ApiError.badRequest('عنوان مسیر الزامی است');
  if (!path.stages || path.stages.length === 0)
    throw ApiError.badRequest('مسیر باید حداقل یک مرحله داشته باشد');

  const hasCourses = path.stages.some((s: any) => s.courses && s.courses.length > 0);
  if (!hasCourses) throw ApiError.badRequest('مسیر باید حداقل یک دوره داشته باشد');
  if (!path.description?.trim()) throw ApiError.badRequest('توضیحات مسیر الزامی است');

  path.status = 'published';
  path.publishedAt = new Date();
  await path.save();

  return ApiResponse.success(res, path, 'مسیر یادگیری منتشر شد');
});

// ════════════════════════════════════════════
// PATCH /api/v1/learning-paths/:id/archive
// ════════════════════════════════════════════
export const archiveLearningPath = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) {
    throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  }
  const path = await LearningPath.findByIdAndUpdate(
    req.params.id,
    { status: 'archived' },
    { new: true },
  );
  if (!path) throw ApiError.notFound('مسیر یافت نشد');
  return ApiResponse.success(res, path, 'مسیر آرشیو شد');
});

// ════════════════════════════════════════════
// POST /api/v1/learning-paths/:id/duplicate
// ✅ FIX #18: Reset isFeatured and displayOrder on duplicate
// ════════════════════════════════════════════
export const duplicateLearningPath = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) {
    throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  }

  const original = await LearningPath.findById(req.params.id);
  if (!original) throw ApiError.notFound('مسیر یافت نشد');

  const originalObj = original.toObject();
  const {
    _id, slug, createdAt, updatedAt, publishedAt,
    enrolledStudents, completionRate, averageRating, totalRatings,
    isFeatured, displayOrder,
    ...rest
  } = originalObj as any;

  const duplicate = await LearningPath.create({
    ...rest,
    title: `${original.title} (کپی)`,
    status: 'draft',
    enrolledStudents: 0,
    completionRate: 0,
    averageRating: 0,
    totalRatings: 0,
    isFeatured: false,
    displayOrder: 0,
    createdBy: (req as any).user._id,
  });

  return ApiResponse.created(res, duplicate, 'مسیر کپی شد');
});

// ════════════════════════════════════════════
// Stages CRUD
// ✅ FIX #6: Whitelist input to prevent Mass Assignment
// ✅ FIX #7: Normalize order after removal
// ✅ FIX #8: Validate stage ID
// ════════════════════════════════════════════
export const addStage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');

  const cleanStage = sanitizeStageInput(req.body);
  if (!cleanStage.title) throw ApiError.badRequest('عنوان مرحله الزامی است');

  path.stages.push({
    ...cleanStage,
    order: path.stages.length,
    courses: [],
  } as any);
  await path.save();
  // 🎯 همگام‌سازی ثبت‌نام‌کننده‌ها با ساختار جدید مراحل
  await syncEnrollmentsAfterStageChange(req.params.id);
  return ApiResponse.created(res, path, 'مرحله اضافه شد');
});

export const updateStage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  if (!isValidMongoId(req.params.stageId)) throw ApiError.badRequest('شناسه مرحله نامعتبر است');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');
  const stage = (path.stages as any).id(req.params.stageId);
  if (!stage) throw ApiError.notFound('مرحله یافت نشد');

  const cleanStage = sanitizeStageInput(req.body);
  Object.keys(cleanStage).forEach((key) => {
    (stage as any)[key] = cleanStage[key];
  });

  await path.save();
  return ApiResponse.success(res, path, 'مرحله به روز رسانی شد');
});

export const removeStage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  if (!isValidMongoId(req.params.stageId)) throw ApiError.badRequest('شناسه مرحله نامعتبر است');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');

  const before = path.stages.length;
  path.stages = path.stages.filter(
    (s: any) => s._id.toString() !== req.params.stageId,
  ) as any;
  if (path.stages.length === before) throw ApiError.notFound('مرحله یافت نشد');

  // ✅ Normalize order
  path.stages.forEach((s: any, i: number) => (s.order = i));
  await path.save();
  // 🎯 ایندکس مرحله‌ی جاری کاربران ممکن است نامعتبر شده باشد
  await syncEnrollmentsAfterStageChange(req.params.id);
  return ApiResponse.success(res, path, 'مرحله حذف شد');
});

export const reorderStages = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');

  const incomingIds: string[] = req.body.stageIds || [];
  const existingIds = path.stages.map((s: any) => s._id.toString());

  // ✅ Validate: incoming list must contain ALL existing IDs (no data loss)
  if (incomingIds.length !== existingIds.length ||
      !existingIds.every((id) => incomingIds.includes(id))) {
    throw ApiError.badRequest('لیست ترتیب باید شامل تمام مراحل موجود باشد');
  }

  const reordered = incomingIds
    .map((id: string, i: number) => {
      const s = (path.stages as any).id(id);
      if (s) s.order = i;
      return s;
    })
    .filter(Boolean);

  path.stages = reordered as any;
  await path.save();
  await syncEnrollmentsAfterStageChange(req.params.id);
  return ApiResponse.success(res, path, 'ترتیب به روز شد');
});

// ════════════════════════════════════════════
// Courses in Stages
// ✅ FIX #29: Validate course existence
// ✅ FIX #8 (#stage): Validate IDs
// ════════════════════════════════════════════
export const addCourseToStage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  if (!isValidMongoId(req.params.stageId)) throw ApiError.badRequest('شناسه مرحله نامعتبر است');

  const courseId = req.body.courseId || req.body.course;
  if (!isValidMongoId(courseId)) throw ApiError.badRequest('شناسه دوره نامعتبر است');

  // ✅ Verify course exists
  const courseExists = await Course.exists({ _id: courseId });
  if (!courseExists) throw ApiError.badRequest('دوره مورد نظر یافت نشد');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');
  const stage = (path.stages as any).id(req.params.stageId);
  if (!stage) throw ApiError.notFound('مرحله یافت نشد');

  // Filter valid prerequisites
  const prerequisites = Array.isArray(req.body.prerequisites)
    ? req.body.prerequisites.map((p: any) => cleanId(p)).filter(Boolean)
    : [];

  stage.courses.push({
    course: courseId,
    order: stage.courses.length,
    isRequired: req.body.isRequired !== false,
    prerequisites,
    estimatedDuration: Number(req.body.estimatedDuration) || 0,
    customTitle: req.body.customTitle?.trim() || undefined,
    customDescription: req.body.customDescription?.trim() || undefined,
  });

  await path.save();
  await syncEnrollmentsAfterStageChange(req.params.id);
  return ApiResponse.created(res, path, 'دوره اضافه شد');
});

export const removeCourseFromStage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  if (!isValidMongoId(req.params.stageId)) throw ApiError.badRequest('شناسه مرحله نامعتبر است');
  if (!isValidMongoId(req.params.courseNodeId)) throw ApiError.badRequest('شناسه دوره نامعتبر است');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');
  const stage = (path.stages as any).id(req.params.stageId);
  if (!stage) throw ApiError.notFound('مرحله یافت نشد');

  const courseIndex = stage.courses.findIndex(
    (cn: any) => cn._id.toString() === req.params.courseNodeId,
  );
  if (courseIndex === -1) throw ApiError.notFound('دوره در مرحله یافت نشد');

  // ✅ FIX #4: شناسه دوره‌ی حذف‌شده را نگه می‌داریم تا از تمام
  // آرایه‌های prerequisites در همه‌ی مراحل پاک شود (جلوگیری از مرجع یتیم)
  const removedCourseId: string = stage.courses[courseIndex].course.toString();

  stage.courses.splice(courseIndex, 1);
  stage.courses.forEach((cn: any, i: number) => (cn.order = i));

  // حذف شناسه از پیش‌نیازهای همه نودهای همه مراحل
  let prereqCleanups = 0;
  for (const s of path.stages as any[]) {
    for (const cn of (s.courses || []) as any[]) {
      if (Array.isArray(cn.prerequisites) && cn.prerequisites.length) {
        const before = cn.prerequisites.length;
        cn.prerequisites = cn.prerequisites.filter(
          (p: any) => p.toString() !== removedCourseId,
        );
        if (cn.prerequisites.length !== before) prereqCleanups++;
      }
    }
  }

  await path.save();
  // 🎯 حذف یک دوره، نسبت دوره‌های اجباری را تغییر می‌دهد
  await syncEnrollmentsAfterStageChange(req.params.id);

  return ApiResponse.success(
    res,
    { path, removedCourseId, prereqCleanups },
    prereqCleanups > 0
      ? `دوره حذف شد و از ${prereqCleanups} پیش‌نیاز پاک شد`
      : 'دوره حذف شد',
  );
});

export const reorderCoursesInStage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');
  if (!isValidMongoId(req.params.stageId)) throw ApiError.badRequest('شناسه مرحله نامعتبر است');

  const path = await LearningPath.findById(req.params.id);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');
  const stage = (path.stages as any).id(req.params.stageId);
  if (!stage) throw ApiError.notFound('مرحله یافت نشد');

  const incomingIds: string[] = req.body.courseNodeIds || [];
  const existingIds = stage.courses.map((c: any) => c._id.toString());

  // ✅ Prevent data loss: list must be complete
  if (incomingIds.length !== existingIds.length ||
      !existingIds.every((id: string) => incomingIds.includes(id))) {
    throw ApiError.badRequest('لیست ترتیب باید شامل تمام دوره‌های موجود باشد');
  }

  const reordered = incomingIds
    .map((id: string, i: number) => {
      const cn = stage.courses.find((c: any) => c._id.toString() === id);
      if (cn) cn.order = i;
      return cn;
    })
    .filter(Boolean);

  stage.courses = reordered;
  await path.save();
  await syncEnrollmentsAfterStageChange(req.params.id);
  return ApiResponse.success(res, path, 'ترتیب دوره‌ها به روز شد');
});

// ════════════════════════════════════════════
// GET /api/v1/learning-paths/available-courses
// ════════════════════════════════════════════
export const getAvailableCourses = asyncHandler(async (req: Request, res: Response) => {
  const { search, category } = req.query;
  const filter: any = { status: 'published' };
  if (search && typeof search === 'string' && search.trim()) {
    const escaped = escapeRegex(search.trim());
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { shortDescription: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (category && isValidMongoId(category)) filter.category = category;

  const { page, limit, skip } = safePagination(req.query, 20);

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .select(
        'title slug thumbnail price discountPrice isFree averageRating totalStudents totalDuration totalLectures level category instructor',
      )
      .populate('instructor', 'fullName avatar')
      .populate('category', 'name slug')
      .skip(skip)
      .limit(limit)
      .lean(),
    Course.countDocuments(filter),
  ]);

  return ApiResponse.paginated(res, courses, page, limit, total, 'دوره‌ها دریافت شد');
});

// ════════════════════════════════════════════
// Enrollment & Progress
// ✅ FIX #5: Increment enrolledStudents
// ✅ FIX #8-alt: Check path is published before enrollment
// ✅ Multi-tenancy support
// ════════════════════════════════════════════
export const enrollInLearningPath = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user._id;
  const pathId = req.params.id;

  if (!isValidMongoId(pathId)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const path = await LearningPath.findById(pathId);
  if (!path) throw ApiError.notFound('مسیر یافت نشد');

  if (path.status !== 'published') {
    throw ApiError.badRequest('امکان ثبت‌نام در این مسیر وجود ندارد');
  }

  const existing = await LearningPathEnrollment.findOne({ user: userId, learningPath: pathId });
  if (existing) throw ApiError.badRequest('قبلا ثبت‌نام شده است');

  const enrollmentData: any = { user: userId, learningPath: pathId };
  if (process.env.MULTI_TENANT_ENABLED === 'true') {
    enrollmentData.tenant = (req as any).tenant?._id;
  }

  const enrollment = await LearningPathEnrollment.create(enrollmentData);

  // ✅ Increment counter
  await LearningPath.findByIdAndUpdate(pathId, { $inc: { enrolledStudents: 1 } });

  return ApiResponse.created(res, enrollment, 'ثبت‌نام انجام شد');
});

// ✅ FIX #3: فیلدهای کافی populate می‌شوند (نه کل سند مسیر) تا پاسخ سبک بماند.
//    status هم برگردانده می‌شود تا فرانت بتواند مسیرهای آرشیو را نشان‌دار کند.
export const getMyLearningPaths = asyncHandler(async (req: Request, res: Response) => {
  const enrollments = await LearningPathEnrollment.find({ user: (req as any).user._id })
    .populate({
      path: 'learningPath',
      select:
        'title slug icon coverImage thumbnail status difficulty stages.title stages.color stages.courses stages.milestone totalCourses estimatedTotalDuration hasCertificate',
    })
    .sort('-lastAccessedAt')
    .lean();

  // پاکسازی ایمن: اگر مسیر حذف شده باشد، learningPath ممکن است null باشد
  const cleaned = enrollments.filter(
    (e: any) => e.learningPath && e.learningPath._id,
  );

  return ApiResponse.success(res, cleaned, 'مسیرهای شما دریافت شد');
});

export const getLearningPathProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const enrollment = await LearningPathEnrollment.findOne({
    user: (req as any).user._id,
    learningPath: req.params.id,
  });
  return ApiResponse.success(
    res,
    { enrollment, progress: enrollment?.progress || 0 },
    'پیشرفت دریافت شد',
  );
});

// ✅ FIX #3: Real progress update
export const updateLearningPathProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const { courseId } = req.body;
  if (!isValidMongoId(courseId)) throw ApiError.badRequest('شناسه دوره نامعتبر است');

  const userId = (req as any).user._id;

  // ⚠️ FIX CRITICAL: پیش از این، endpoint مربوط به یک مسیر بود ولی سرویس همه‌ی
  // ثبت‌نام‌های کاربر را تغییر می‌داد. حالا فقط همین مسیر هدف قرار می‌گیرد.
  const enrollment = await LearningPathEnrollment.findOne({
    user: userId,
    learningPath: req.params.id,
  });
  if (!enrollment) throw ApiError.notFound('ثبت‌نام شما در این مسیر یافت نشد');

  // 🎯 اعتبارسنجی: دوره باید واقعاً عضو همین مسیر باشد
  const learningPath = await LearningPath.findById(req.params.id).select('stages');
  if (!learningPath) throw ApiError.notFound('مسیر یافت نشد');

  const courseBelongsToPath = (learningPath.stages || []).some((s: any) =>
    (s.courses || []).some((cn: any) => cn.course?.toString() === courseId.toString()),
  );
  if (!courseBelongsToPath) {
    throw ApiError.badRequest('این دوره بخشی از مسیر یادگیری نیست');
  }

  await LearningPathProgressService.onCourseCompleted(userId, courseId, req.params.id);

  const updatedEnrollment = await LearningPathEnrollment.findOne({
    user: userId,
    learningPath: req.params.id,
  });

  return ApiResponse.success(
    res,
    { progress: updatedEnrollment?.progress ?? 0, enrollment: updatedEnrollment },
    'پیشرفت به روز شد',
  );
});

// ✅ FIX #6: Real stats
export const getLearningPathStats = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const [totalEnrollments, activeEnrollments, completedEnrollments, avgProgressAgg] =
    await Promise.all([
      LearningPathEnrollment.countDocuments({ learningPath: req.params.id }),
      LearningPathEnrollment.countDocuments({ learningPath: req.params.id, status: 'active' }),
      LearningPathEnrollment.countDocuments({ learningPath: req.params.id, status: 'completed' }),
      LearningPathEnrollment.aggregate([
        { $match: { learningPath: req.params.id } },
        { $group: { _id: null, avg: { $avg: '$progress' } } },
      ]),
    ]);

  return ApiResponse.success(
    res,
    {
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      averageProgress: Math.round(avgProgressAgg[0]?.avg || 0),
      completionRate:
        totalEnrollments > 0
          ? Math.round((completedEnrollments / totalEnrollments) * 100)
          : 0,
    },
    'آمار دریافت شد',
  );
});

// ════════════════════════════════════════════
// Cover Upload
// ✅ FIX #10: try/finally for file cleanup
// ════════════════════════════════════════════
export const uploadLearningPathCover = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('فایلی انتخاب نشده است');
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  try {
    const result = await uploadToCloudinary(req.file.path, 'learning-paths/covers', 'image');
    await LearningPath.findByIdAndUpdate(req.params.id, { coverImage: result.url });
    return ApiResponse.success(res, { coverImage: result.url }, 'تصویر کاور آپلود شد');
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
  }
});

export const uploadLearningPathCoverTemp = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ApiError.badRequest('فایلی انتخاب نشده است');

  try {
    const result = await uploadToCloudinary(req.file.path, 'learning-paths/covers', 'image');
    return ApiResponse.success(res, { coverImage: result.url, url: result.url }, 'تصویر موقت آپلود شد');
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
  }
});

// ✅ FIX #28: preview with populate
export const previewLearningPath = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه نامعتبر');
  const path = await LearningPath.findById(req.params.id)
    .populate('category', 'name slug icon')
    .populate({
      path: 'stages.courses.course',
      select: 'title slug thumbnail averageRating totalStudents totalDuration',
    })
    .lean();
  if (!path) throw ApiError.notFound('مسیر یافت نشد');
  return ApiResponse.success(res, path, 'پیش‌نمایش مسیر');
});

// ════════════════════════════════════════════
// Assignment endpoints
// ════════════════════════════════════════════
export const searchForAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { q } = req.query;
  const filter: any = {};
  if (q && typeof q === 'string' && q.trim()) {
    filter.title = { $regex: escapeRegex(q.trim()), $options: 'i' };
  }

  const paths = await LearningPath.find(filter)
    .select('title icon status stages.title stages.courses')
    .limit(20)
    .lean();

  const result = paths.map((p: any) => ({
    _id: p._id,
    title: p.title,
    icon: p.icon,
    status: p.status,
    stages: (p.stages || []).map((s: any) => ({
      _id: s._id,
      title: s.title,
      coursesCount: s.courses?.length || 0,
    })),
    totalCourses: (p.stages || []).reduce(
      (sum: number, s: any) => sum + (s.courses?.length || 0),
      0,
    ),
  }));

  return ApiResponse.success(res, result, 'مسیرها دریافت شد');
});

export const getDetailsForAssignment = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.id)) throw ApiError.badRequest('شناسه مسیر نامعتبر است');

  const path = await LearningPath.findById(req.params.id)
    .select('title icon status stages')
    .populate({
      path: 'stages.courses.course',
      select: 'title slug thumbnail',
    })
    .lean();

  if (!path) throw ApiError.notFound('مسیر یافت نشد');

  return ApiResponse.success(res, path, 'جزئیات مسیر دریافت شد');
});

// ✅ FIX #17: quickCreate as draft (not auto-published/featured)
export const quickCreate = asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    subtitle,
    icon,
    difficulty,
    shortDescription,
    description,
    firstStage,
    courseId,
    courseSettings,
  } = req.body;

  if (!isValidMongoId(courseId)) {
    throw ApiError.badRequest('شناسه دوره نامعتبر است');
  }
  const course = await Course.findById(courseId).select('title');
  if (!course) throw ApiError.badRequest('دوره مورد نظر یافت نشد');

  const pathData: any = {
    title: (title || '').trim() || `مسیر ${course.title}`,
    subtitle: subtitle?.trim() || '',
    icon: icon || '📚',
    difficulty: difficulty || 'beginner',
    shortDescription: shortDescription?.trim() || `مسیر یادگیری شامل دوره ${course.title}`,
    description: description?.trim() || `مسیر یادگیری ${course.title}`,
    status: 'draft', // ✅ Draft — admin must publish manually
    isFeatured: false, // ✅ Not featured by default
    createdBy: (req as any).user._id,
    stages: [
      {
        title: (firstStage?.title || 'مرحله اول').trim().slice(0, 100),
        description: (firstStage?.description || '').trim().slice(0, 500),
        icon: firstStage?.icon || '📚',
        color: firstStage?.color || '#a435f0',
        order: 0,
        courses: [
          {
            course: courseId,
            order: 0,
            isRequired: courseSettings?.isRequired !== false,
            prerequisites: [],
            estimatedDuration: Number(courseSettings?.estimatedDuration) || 0,
            customTitle: courseSettings?.customTitle?.trim() || undefined,
            customDescription: courseSettings?.customDescription?.trim() || undefined,
          },
        ],
      },
    ],
  };

  const validCategory = cleanId(req.body.category);
  if (validCategory) pathData.category = validCategory;

  const newPath = await LearningPath.create(pathData);

  const populated = await LearningPath.findById(newPath._id)
    .populate('category', 'name slug icon')
    .populate('stages.courses.course', 'title slug thumbnail')
    .maxTimeMS(10000);

  return ApiResponse.created(res, populated, 'مسیر یادگیری به‌عنوان پیش‌نویس ساخته شد');
});

export const getLearningPathsWithCourse = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidMongoId(req.params.courseId)) {
    throw ApiError.badRequest('شناسه دوره نامعتبر است');
  }

  const paths = await LearningPath.find({
    'stages.courses.course': req.params.courseId,
  })
    .select('title icon status stages.title stages.courses')
    .lean();

  const result = paths.map((p: any) => ({
    _id: p._id,
    title: p.title,
    icon: p.icon,
    status: p.status,
    stage: p.stages.find((s: any) =>
      s.courses?.some((c: any) => c.course?.toString() === req.params.courseId),
    ),
  }));

  return ApiResponse.success(res, result, 'مسیرهای مرتبط با دوره دریافت شد');
});