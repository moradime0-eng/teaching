import { body, param } from 'express-validator';

export const createCampaignValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('عنوان کمپین الزامی است')
    .isLength({ min: 3, max: 100 })
    .withMessage('عنوان باید بین 3 تا 100 کاراکتر باشد'),

  body('bannerText')
    .trim()
    .notEmpty()
    .withMessage('متن بنر الزامی است')
    .isLength({ max: 300 })
    .withMessage('متن بنر حداکثر 300 کاراکتر می‌تواند باشد'),

  body('startAt')
    .notEmpty()
    .withMessage('تاریخ شروع الزامی است')
    .isISO8601()
    .withMessage('تاریخ شروع معتبر نیست'),

  body('endAt')
    .notEmpty()
    .withMessage('تاریخ پایان الزامی است')
    .isISO8601()
    .withMessage('تاریخ پایان معتبر نیست')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.startAt)) {
        throw new Error('تاریخ پایان باید بعد از تاریخ شروع باشد');
      }
      return true;
    }),

  body('discountType')
    .notEmpty()
    .withMessage('نوع تخفیف الزامی است')
    .isIn(['percentage', 'fixed'])
    .withMessage('نوع تخفیف باید percentage یا fixed باشد'),

  body('discountValue')
    .notEmpty()
    .withMessage('مقدار تخفیف الزامی است')
    .isNumeric()
    .withMessage('مقدار تخفیف باید عددی باشد')
    .custom((value, { req }) => {
      if (req.body.discountType === 'percentage' && (value < 1 || value > 100)) {
        throw new Error('درصد تخفیف باید بین 1 تا 100 باشد');
      }
      if (req.body.discountType === 'fixed' && value <= 0) {
        throw new Error('مبلغ تخفیف ثابت باید بزرگتر از صفر باشد');
      }
      return true;
    }),

  body('maxDiscount')
    .optional()
    .isNumeric()
    .withMessage('حداکثر تخفیف باید عددی باشد')
    .custom((value, { req }) => {
      if (req.body.discountType === 'percentage' && value !== undefined && value < 0) {
        throw new Error('حداکثر تخفیف نمی‌تواند منفی باشد');
      }
      return true;
    }),

  body('scope')
    .notEmpty()
    .withMessage('محدوده کمپین الزامی است')
    .isIn(['all', 'categories'])
    .withMessage('محدوده باید all یا categories باشد'),

  body('categories')
    .optional()
    .isArray()
    .withMessage('دسته‌بندی‌ها باید آرایه باشد')
    .custom((value, { req }) => {
      if (req.body.scope === 'categories' && (!value || value.length === 0)) {
        throw new Error('برای محدوده دسته‌بندی، حداقل یک دسته‌بندی انتخاب کنید');
      }
      return true;
    }),

  body('excludedCourses')
    .optional()
    .isArray()
    .withMessage('دوره‌های مستثنی باید آرایه باشد'),

  body('theme')
    .notEmpty()
    .withMessage('تم کمپین الزامی است')
    .isIn(['fire', 'cold', 'gold', 'green'])
    .withMessage('تم باید یکی از fire, cold, gold, green باشد'),

  // ─── 🎨 Custom banner colors (optional) ───
  body('colors').optional().isObject().withMessage('رنگ‌بندی باید یک آبجکت باشد'),

  body('colors.background')
    .optional({ nullable: true })
    .isString()
    .matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .withMessage('رنگ پس‌زمینه باید کد هگز معتبر باشد (مثال: #b93818)'),

  body('colors.gradient')
    .optional({ nullable: true })
    .isArray()
    .custom((arr: any) => {
      if (!Array.isArray(arr)) return false;
      if (arr.length < 2 || arr.length > 4) return false;
      return arr.every((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c));
    })
    .withMessage('گرادیان باید بین 2 تا 4 رنگ هگز معتبر داشته باشد'),

  body('colors.gradientAngle')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 360 })
    .withMessage('زاویه گرادیان باید عددی بین 0 تا 360 باشد'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('وضعیت فعال باید بولین باشد'),
];

export const updateCampaignValidator = [
  param('id').isMongoId().withMessage('شناسه کمپین معتبر نیست'),

  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('عنوان باید بین 3 تا 100 کاراکتر باشد'),

  body('bannerText')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('متن بنر حداکثر 300 کاراکتر می‌تواند باشد'),

  body('startAt')
    .optional()
    .isISO8601()
    .withMessage('تاریخ شروع معتبر نیست'),

  body('endAt')
    .optional()
    .isISO8601()
    .withMessage('تاریخ پایان معتبر نیست')
    .custom((value, { req }) => {
      if (req.body.startAt && new Date(value) <= new Date(req.body.startAt)) {
        throw new Error('تاریخ پایان باید بعد از تاریخ شروع باشد');
      }
      return true;
    }),

  body('discountType')
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('نوع تخفیف باید percentage یا fixed باشد'),

  body('discountValue')
    .optional()
    .isNumeric()
    .withMessage('مقدار تخفیف باید عددی باشد')
    .custom((value, { req }) => {
      const discountType = req.body.discountType;
      if (discountType === 'percentage' && (value < 1 || value > 100)) {
        throw new Error('درصد تخفیف باید بین 1 تا 100 باشد');
      }
      if (discountType === 'fixed' && value <= 0) {
        throw new Error('مبلغ تخفیف ثابت باید بزرگتر از صفر باشد');
      }
      return true;
    }),

  body('maxDiscount')
    .optional()
    .isNumeric()
    .withMessage('حداکثر تخفیف باید عددی باشد'),

  body('scope')
    .optional()
    .isIn(['all', 'categories'])
    .withMessage('محدوده باید all یا categories باشد'),

  body('categories')
    .optional()
    .isArray()
    .withMessage('دسته‌بندی‌ها باید آرایه باشد')
    .custom((value, { req }) => {
      const scope = req.body.scope;
      if (scope === 'categories' && (!value || value.length === 0)) {
        throw new Error('برای محدوده دسته‌بندی، حداقل یک دسته‌بندی انتخاب کنید');
      }
      return true;
    }),

  body('excludedCourses')
    .optional()
    .isArray()
    .withMessage('دوره‌های مستثنی باید آرایه باشد'),

  body('theme')
    .optional()
    .isIn(['fire', 'cold', 'gold', 'green'])
    .withMessage('تم باید یکی از fire, cold, gold, green باشد'),

  // ─── 🎨 Custom banner colors (optional) ───
  body('colors').optional().isObject().withMessage('رنگ‌بندی باید یک آبجکت باشد'),

  body('colors.background')
    .optional({ nullable: true })
    .isString()
    .matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .withMessage('رنگ پس‌زمینه باید کد هگز معتبر باشد (مثال: #b93818)'),

  body('colors.gradient')
    .optional({ nullable: true })
    .isArray()
    .custom((arr: any) => {
      if (!Array.isArray(arr)) return false;
      if (arr.length < 2 || arr.length > 4) return false;
      return arr.every((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c));
    })
    .withMessage('گرادیان باید بین 2 تا 4 رنگ هگز معتبر داشته باشد'),

  body('colors.gradientAngle')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 360 })
    .withMessage('زاویه گرادیان باید عددی بین 0 تا 360 باشد'),

  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('وضعیت فعال باید بولین باشد'),
];

export const campaignIdParamValidator = [
  param('id').isMongoId().withMessage('شناسه کمپین معتبر نیست'),
];