import { body, param, query } from 'express-validator';
import { LectureType, PromoVideoType } from '../enums/LectureType';

/** حذف تگ‌های HTML از متن برای شمردن طول واقعی متن خام */
const stripHtml = (value: string): string =>
  value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

export const createCourseValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('عنوان دوره الزامی است')
    .isLength({ min: 10, max: 150 })
    .withMessage('عنوان باید بین 10 تا 150 کاراکتر باشد'),

  body('subtitle')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .custom((value) => {
      const plainText = stripHtml(value);
      if (plainText.length > 5000) {
        throw new Error('زیرعنوان حداکثر 5000 کاراکتر می\u200cتواند باشد');
      }
      return true;
    }),

  body('description')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .custom((value) => {
      const plainText = stripHtml(value);
      if (plainText.length < 100) {
        throw new Error('توضیحات باید حداقل 100 کاراکتر باشد');
      }
      return true;
    }),

  body('shortDescription')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .custom((value) => {
      const plainText = stripHtml(value);
      if (plainText.length > 300) {
        throw new Error('توضیح کوتاه حداکثر 300 کاراکتر می‌تواند باشد');
      }
      return true;
    }),

  body('category')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('شناسه دسته‌بندی معتبر نیست'),

  body('subCategory')
    .optional({ nullable: true, checkFalsy: true })
    .isMongoId()
    .withMessage('شناسه زیردسته‌بندی معتبر نیست'),

  body('level')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['beginner', 'intermediate', 'advanced', 'all-levels'])
    .withMessage('سطح دوره معتبر نیست'),

  body('language').optional({ nullable: true, checkFalsy: true }).isString(),

  body('price')
    .optional({ nullable: true })
    .isNumeric()
    .withMessage('قیمت باید عدد باشد')
    .custom((value, { req }) => {
      const numValue = Number(value);
      const isFree = req.body.isFree === true || req.body.isFree === 'true';
      if (!isFree && (!value || numValue <= 0)) {
        throw new Error('قیمت برای دوره‌های پولی الزامی است');
      }
      return true;
    }),

  body('discountPrice')
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage('قیمت تخفیف باید عدد باشد')
    .custom((value, { req }) => {
      const numDiscount = Number(value);
      const numPrice = Number(req.body.price);
      if (value && req.body.price && numDiscount >= numPrice) {
        throw new Error('قیمت تخفیف باید کمتر از قیمت اصلی باشد');
      }
      return true;
    }),

  body('discountEndsAt')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('تاریخ پایان تخفیف معتبر نیست'),

  body('discountType')
    .optional({ nullable: true })
    .isIn(['none', 'manual', 'countdown'])
    .withMessage('نوع تخفیف باید none، manual یا countdown باشد'),

  body('countdownDiscount')
    .optional({ nullable: true })
    .isObject()
    .withMessage('تنظیمات تخفیف معکوس زمان‌دار باید یک شیء باشد'),

  body('countdownDiscount.enabled')
    .optional()
    .isBoolean()
    .withMessage('فیلد enabled باید بولی باشد'),

  body('countdownDiscount.startAt')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('تاریخ شروع کمپین معتبر نیست'),

  body('countdownDiscount.endAt')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('تاریخ پایان کمپین معتبر نیست'),

  body('countdownDiscount.initialPercent')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('درصد تخفیف اولیه باید بین 0 تا 100 باشد'),

  body('countdownDiscount.finalPercent')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('درصد تخفیف نهایی باید بین 0 تا 100 باشد'),

  body('countdownDiscount.mode')
    .optional({ nullable: true })
    .isIn(['linear', 'step'])
    .withMessage('حالت کاهش باید linear یا step باشد'),

  body('countdownDiscount.stepIntervalMinutes')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('فاصله کاهش باید حداقل 1 دقیقه باشد'),

  body('countdownDiscount.stepPercent')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('مقدار کاهش باید بین 0 تا 100 باشد'),

  body('isFree').optional({ nullable: true }).isBoolean().withMessage('فیلد isFree باید بولی باشد'),

  body('hasCertificate')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('فیلد hasCertificate باید بولی باشد'),

  body('hasLifetimeAccess')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('فیلد hasLifetimeAccess باید بولی باشد'),

  body('hasSupport')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('فیلد hasSupport باید بولی باشد'),

  body('maxStudents')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('حداکثر تعداد دانشجو باید عدد مثبت باشد'),

  body('installmentEnabled')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('فیلد installmentEnabled باید بولی باشد'),

  body('installmentCount')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      const num = Number(value);
      if (![2, 3, 6].includes(num)) {
        throw new Error('تعداد اقساط باید 2، 3 یا 6 باشد');
      }
      return true;
    }),

  body('requirements')
    .optional({ nullable: true })
    .isArray()
    .withMessage('پیش‌نیازها باید آرایه باشند'),

  body('requirements.*')
    .optional()
    .isString()
    .isLength({ max: 300 })
    .withMessage('هر پیش‌نیاز حداکثر 300 کاراکتر می‌تواند باشد'),

  body('learningOutcomes')
    .optional({ nullable: true })
    .isArray()
    .withMessage('اهداف دورهها باید آرایه باشند'),

  body('learningOutcomes.*')
    .optional()
    .isString()
    .isLength({ max: 300 })
    .withMessage('هر اهداف دوره حداکثر 300 کاراکتر می‌تواند باشد'),

  body('targetAudience')
    .optional({ nullable: true })
    .isArray()
    .withMessage('مخاطبان هدف باید آرایه باشند'),

  body('targetAudience.*')
    .optional()
    .isString()
    .isLength({ max: 300 })
    .withMessage('هر مخاطب هدف حداکثر 300 کاراکتر می‌تواند باشد'),

  body('tags').optional({ nullable: true }).isArray().withMessage('برچسب‌ها باید آرایه باشند'),

  body('tags.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('هر برچسب حداکثر 50 کاراکتر می‌تواند باشد'),

  body('thumbnail')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('تصویر کاور باید رشته باشد'),

  body('promoVideo')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('ویدیو معرفی باید رشته باشد'),

  body('promoVideoType')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(Object.values(PromoVideoType))
    .withMessage('نوع ویدیو معرفی معتبر نیست'),

  body('promoVideoUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('لینک ویدیو معرفی معتبر نیست'),

  body('slug')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    // ⚠️ FIX: اسلاگ دوره‌ها می‌تواند فارسی باشد (خودِ بک‌اند در
    // generateUniqueSlugForCourse کاراکترهای \u0600-\u06FF را نگه می‌دارد)
    .matches(/^[؀-ۿa-z0-9-]+$/)
    .withMessage('اسلاگ فقط می‌تواند شامل حروف فارسی/انگلیسی کوچک، اعداد و خط تیره باشد')
    .isLength({ max: 150 })
    .withMessage('اسلاگ حداکثر 150 کاراکتر می‌تواند باشد'),

  body('metaTitle')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ max: 60 })
    .withMessage('عنوان متا حداکثر 60 کاراکتر می‌تواند باشد'),

  body('metaDescription')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .custom((value) => {
      const plainText = stripHtml(value);
      if (plainText.length > 200) {
        throw new Error('توضیحات متا حداکثر 200 کاراکتر می\u200cتواند باشد');
      }
      return true;
    }),

  body('keywords')
    .optional({ nullable: true })
    .isArray()
    .withMessage('کلمات کلیدی باید آرایه باشند'),

  body('keywords.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('هر کلمه کلیدی حداکثر 50 کاراکتر می‌تواند باشد'),

  body('sections').optional({ nullable: true }).isArray().withMessage('فصول باید آرایه باشند'),

  body('sections.*.title')
    .optional()
    .notEmpty()
    .withMessage('عنوان فصل الزامی است')
    .isLength({ max: 200 })
    .withMessage('عنوان فصل حداکثر 200 کاراکتر می‌تواند باشد'),

  body('sections.*.description')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ max: 1000 })
    .withMessage('توضیحات فصل حداکثر 1000 کاراکتر می‌تواند باشد'),

  body('sections.*.lectures')
    .optional({ nullable: true })
    .isArray()
    .withMessage('دروس باید آرایه باشند'),

  body('sections.*.lectures.*.title')
    .optional()
    .notEmpty()
    .withMessage('عنوان درس الزامی است')
    .isLength({ max: 200 })
    .withMessage('عنوان درس حداکثر 200 کاراکتر می‌تواند باشد'),

  body('sections.*.lectures.*.type')
    .optional()
    .isIn(Object.values(LectureType))
    .withMessage('نوع درس معتبر نیست'),

  body('sections.*.lectures.*.duration')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('مدت زمان درس باید عدد صحیح غیرمنفی باشد'),

  body('sections.*.lectures.*.isFreePreview')
    .optional()
    .isBoolean()
    .withMessage('فیلد isFreePreview باید بولی باشد'),

  body('sections.*.lectures.*.content').optional({ nullable: true, checkFalsy: true }).isString(),

  body('sections.*.lectures.*.videoUrl').optional({ nullable: true, checkFalsy: true }).isString(),

  body('sections.*.lectures.*.videoFileName')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('videoFileName باید رشته باشد'),

  body('sections.*.lectures.*.videoFileSize')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('videoFileSize باید عدد صحیح غیرمنفی باشد'),

  body('sections.*.lectures.*.fileUrl').optional({ nullable: true, checkFalsy: true }).isString(),

  body('sections.*.lectures.*.fileName')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('fileName باید رشته باشد'),

  body('sections.*.lectures.*.fileSize')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('fileSize باید عدد صحیح غیرمنفی باشد'),

  // Content Items validation
  body('sections.*.lectures.*.contentItems').optional({ nullable: true }).isArray().withMessage('محتواهای درس باید آرایه باشند'),

  body('sections.*.lectures.*.contentItems.*.type')
    .optional()
    .isIn(['video', 'rich-text', 'attachment', 'external-link', 'image', 'audio'])
    .withMessage('نوع محتوای نامعتبر است'),

  body('sections.*.lectures.*.contentItems.*.title')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('عنوان محتوا حداکثر 200 کاراکتر می‌تواند باشد'),

  body('sections.*.lectures.*.contentItems.*.description')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage('توضیح محتوا حداکثر 2000 کاراکتر می‌تواند باشد'),

  body('sections.*.lectures.*.contentItems.*.order')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('ترتیب محتوا باید عدد صحیح غیرمنفی باشد'),

  // Video content item fields
  body('sections.*.lectures.*.contentItems.*.videoUrl').optional({ nullable: true, checkFalsy: true }).isString(),
  body('sections.*.lectures.*.contentItems.*.videoFileName').optional({ nullable: true, checkFalsy: true }).isString(),
  body('sections.*.lectures.*.contentItems.*.videoFileSize').optional({ nullable: true }).isInt({ min: 0 }),
  body('sections.*.lectures.*.contentItems.*.videoDuration').optional({ nullable: true }).isInt({ min: 0 }),

  // Rich text content item fields
  body('sections.*.lectures.*.contentItems.*.richTextContent').optional({ nullable: true, checkFalsy: true }).isString(),

  // Attachment content item fields
  body('sections.*.lectures.*.contentItems.*.fileUrl').optional({ nullable: true, checkFalsy: true }).isString(),
  body('sections.*.lectures.*.contentItems.*.fileName').optional({ nullable: true, checkFalsy: true }).isString(),
  body('sections.*.lectures.*.contentItems.*.fileSize').optional({ nullable: true }).isInt({ min: 0 }),
  body('sections.*.lectures.*.contentItems.*.fileType').optional({ nullable: true, checkFalsy: true }).isString(),

  // External link content item fields
  body('sections.*.lectures.*.contentItems.*.externalUrl').optional({ nullable: true, checkFalsy: true }).isURL().withMessage('لینک خارجی معتبر نیست'),

  // Image content item fields
  body('sections.*.lectures.*.contentItems.*.imageUrl').optional({ nullable: true, checkFalsy: true }).isString(),

  // Audio content item fields
  body('sections.*.lectures.*.contentItems.*.audioUrl').optional({ nullable: true, checkFalsy: true }).isString(),
  body('sections.*.lectures.*.contentItems.*.audioFileName').optional({ nullable: true, checkFalsy: true }).isString(),
  body('sections.*.lectures.*.contentItems.*.audioFileSize').optional({ nullable: true }).isInt({ min: 0 }),
  body('sections.*.lectures.*.contentItems.*.audioDuration').optional({ nullable: true }).isInt({ min: 0 }),

  body('status')
    .optional({ nullable: true })
    .isIn(['draft', 'pending', 'published', 'rejected', 'archived'])
    .withMessage('وضعیت دوره معتبر نیست'),

  body('rejectionReason')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ min: 5, max: 2000 })
    .withMessage('دلیل رد دوره باید بین 5 تا 2000 کاراکتر باشد'),
];

export const updateCourseValidator = [
  param('id').isMongoId().withMessage('شناسه دوره معتبر نیست'),
  ...createCourseValidator.filter((v) => !('location' in v && (v as any).location === 'params')),
];

export const courseIdParamValidator = [
  param('id').isMongoId().withMessage('شناسه دوره معتبر نیست'),
];

export const courseSlugParamValidator = [
  param('slug')
    .notEmpty()
    .withMessage('اسلاگ الزامی است')
    .isString()
    .withMessage('اسلاگ باید متنی باشد'),
];

export const courseQueryValidator = [
  query('category').optional({ nullable: true, checkFalsy: true }).isMongoId(),

  query('level').optional({ nullable: true, checkFalsy: true }).isString(),

  query('sort').optional({ nullable: true, checkFalsy: true }).isString(),

  query('search').optional({ nullable: true, checkFalsy: true }).isString(),

  query('page').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }),

  query('limit').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 100 }),
];
