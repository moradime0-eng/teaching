// backend/src/validators/learningPathValidator.ts

import { body, param } from 'express-validator';
import { validate } from '../middlewares/validate';

// ────────────────────────────────────────────
// ایجاد مسیر
// ────────────────────────────────────────────
export const createLearningPathValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('عنوان مسیر الزامی است')
    .isLength({ max: 200 })
    .withMessage('عنوان نمی‌تواند بیشتر از ۲۰۰ کاراکتر باشد'),

  body('shortDescription')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('خلاصه کوتاه حداکثر ۳۰۰ کاراکتر'),

  body('description').optional().trim(),

  body('subtitle')
    .optional()
    .isLength({ max: 300 })
    .withMessage('زیرعنوان حداکثر ۳۰۰ کاراکتر'),

  body('icon').optional().isLength({ max: 10 }),

  body('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced', 'mixed'])
    .withMessage('سطح دشواری نامعتبر است'),

  body('category')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!value || value === '' || value === 'null' || value === 'undefined') return true;
      if (/^[0-9a-fA-F]{24}$/.test(String(value))) return true;
      throw new Error('شناسه دسته‌بندی نامعتبر است');
    }),

  body('stages').optional().isArray().withMessage('مراحل باید آرایه باشد'),

  body('stages.*.title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('عنوان مرحله الزامی است')
    .isLength({ max: 100 }),

  body('tags').optional().isArray().withMessage('برچسب‌ها باید آرایه باشد'),
  body('targetAudience').optional().isArray().withMessage('مخاطبان هدف باید آرایه باشد'),
  body('learningOutcomes').optional().isArray().withMessage('اهداف یادگیری باید آرایه باشد'),

  body('hasCertificate').optional().isBoolean({ strict: false }),

  body('certificateTitle')
    .optional()
    .isLength({ max: 200 })
    .withMessage('عنوان گواهینامه حداکثر ۲۰۰ کاراکتر'),

  body('isFeatured').optional().isBoolean({ strict: false }),

  body('coverImage').optional().isString(),

  validate,
];

// ────────────────────────────────────────────
// به‌روزرسانی مسیر
// ✅ FIX #9: status field removed to prevent bypass
// ────────────────────────────────────────────
export const updateLearningPathValidator = [
  param('id').isMongoId().withMessage('شناسه مسیر نامعتبر است'),

  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('عنوان حداکثر ۲۰۰ کاراکتر'),

  body('shortDescription').optional().trim().isLength({ max: 300 }),
  body('description').optional().trim(),

  // ❌ status removed — use PATCH /publish or /archive
  // body('status') was here — removed intentionally

  body('category')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!value || value === '' || value === 'null' || value === 'undefined') return true;
      if (/^[0-9a-fA-F]{24}$/.test(String(value))) return true;
      throw new Error('شناسه دسته‌بندی نامعتبر است');
    }),

  body('hasCertificate').optional().isBoolean({ strict: false }),
  body('isFeatured').optional().isBoolean({ strict: false }),
  body('coverImage').optional().isString(),

  validate,
];

// ────────────────────────────────────────────
// افزودن مرحله
// ────────────────────────────────────────────
export const addStageValidator = [
  param('id').isMongoId().withMessage('شناسه مسیر نامعتبر است'),

  body('title')
    .trim()
    .notEmpty()
    .withMessage('عنوان مرحله الزامی است')
    .isLength({ max: 100 })
    .withMessage('عنوان مرحله حداکثر ۱۰۰ کاراکتر'),

  body('description').optional().isLength({ max: 10000 }),

  body('icon').optional().trim().isLength({ max: 10 }),

  body('color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('رنگ باید فرمت HEX باشد'),

  validate,
];

// ────────────────────────────────────────────
// افزودن دوره
// ────────────────────────────────────────────
export const addCourseToStageValidator = [
  param('id').isMongoId().withMessage('شناسه مسیر نامعتبر است'),
  param('stageId').isMongoId().withMessage('شناسه مرحله نامعتبر است'),

  body('courseId')
    .notEmpty()
    .withMessage('شناسه دوره الزامی است')
    .isMongoId()
    .withMessage('شناسه دوره نامعتبر است'),

  body('isRequired').optional().isBoolean({ strict: false }),
  // ✅ FIX #5: isUnlocked حذف شد

  body('prerequisites').optional().isArray().withMessage('پیش‌نیازها باید آرایه باشد'),
  body('prerequisites.*').optional().isMongoId().withMessage('شناسه پیش‌نیاز نامعتبر است'),

  body('customTitle').optional().isLength({ max: 200 }),
  body('customDescription').optional().isLength({ max: 1000 }),

  validate,
];

// ────────────────────────────────────────────
// مرتب‌سازی مراحل
// ────────────────────────────────────────────
export const reorderStagesValidator = [
  param('id').isMongoId().withMessage('شناسه مسیر نامعتبر است'),
  body('stageIds').isArray({ min: 1 }).withMessage('لیست مراحل الزامی است'),
  body('stageIds.*').isMongoId().withMessage('شناسه مرحله نامعتبر است'),
  validate,
];

// ────────────────────────────────────────────
// مرتب‌سازی دوره‌ها
// ────────────────────────────────────────────
export const reorderCoursesValidator = [
  param('id').isMongoId().withMessage('شناسه مسیر نامعتبر است'),
  param('stageId').isMongoId().withMessage('شناسه مرحله نامعتبر است'),
  body('courseNodeIds').isArray({ min: 1 }).withMessage('لیست دوره‌ها الزامی است'),
  body('courseNodeIds.*').isMongoId().withMessage('شناسه دوره نامعتبر است'),
  validate,
];

// ────────────────────────────────────────────
// پارامترهای رایج
// ────────────────────────────────────────────
export const learningPathIdValidator = [
  param('id').isMongoId().withMessage('شناسه مسیر نامعتبر است'),
  validate,
];

export const learningPathSlugValidator = [
  param('slug').notEmpty().withMessage('نامک مسیر الزامی است'),
  validate,
];

// ────────────────────────────────────────────
// Quick Create
// ────────────────────────────────────────────
export const quickCreateValidator = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('عنوان مسیر حداکثر ۲۰۰ کاراکتر'),

  body('courseId')
    .notEmpty()
    .withMessage('شناسه دوره الزامی است')
    .isMongoId()
    .withMessage('شناسه دوره نامعتبر است'),

  body('firstStage').optional().isObject().withMessage('اطلاعات مرحله اول باید آبجکت باشد'),

  body('firstStage.title')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('عنوان مرحله حداکثر ۱۰۰ کاراکتر'),

  body('firstStage.color')
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage('رنگ مرحله باید HEX باشد'),

  body('courseSettings').optional().isObject(),
  body('courseSettings.isRequired').optional().isBoolean({ strict: false }),
  // ✅ FIX #5: courseSettings.isUnlocked عمداً اعتبارسنجی نمی‌شود (فیلد حذف شد)

  validate,
];