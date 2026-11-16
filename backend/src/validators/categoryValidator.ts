import { body, param } from 'express-validator';

export const createCategoryValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('نام دسته‌بندی الزامی است')
    .isLength({ min: 2, max: 60 })
    .withMessage('نام باید بین ۲ تا ۶۰ کاراکتر باشد'),

  body('slug')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .withMessage('اسلاگ باید رشته باشد')
    .trim()
    .isLength({ max: 80 })
    .withMessage('اسلاگ حداکثر ۸۰ کاراکتر'),

  body('description').optional().isLength({ max: 200 }).withMessage('توضیحات حداکثر 200 کاراکتر'),

  body('parent').optional({ nullable: true }).isMongoId().withMessage('شناسه والد معتبر نیست'),

  body('order').optional().isInt({ min: 0 }).withMessage('ترتیب باید عدد مثبت باشد'),

  body('isActive').optional().isBoolean().withMessage('وضعیت فعال باید بولین باشد'),

  // 🎨 رنگ اختیاری است — رشتهٔ خالی یعنی «بدون رنگ پس‌زمینه»
  body('color')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .withMessage('رنگ باید کد هگز معتبر باشد (مثال: #8b5cf6)'),

  body('iconType')
    .optional()
    .isIn(['material', 'emoji', 'google', 'custom'])
    .withMessage('نوع آیکون باید یکی از material، emoji، google یا custom باشد'),

  body('icon').optional().isString().isLength({ max: 500 }).withMessage('آیکون نامعتبر است'),

  body('customIconUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .isLength({ max: 1000 })
    .withMessage('آیکون سفارشی باید رشته باشد')
    .custom((value: string) => {
      // 🛡️ فقط مسیرهای امن (http/https یا مسیر داخلی assets) مجاز هستند
      if (/^(https?:\/\/|\/assets\/|assets\/)/i.test(value)) return true;
      throw new Error('آدرس آیکون باید با http/https یا /assets/ شروع شود');
    }),

  body('metaTitle').optional().isLength({ max: 60 }).withMessage('عنوان متا حداکثر 60 کاراکتر'),

  body('metaDescription')
    .optional()
    .isLength({ max: 200 })
    .withMessage('توضیحات متا حداکثر 200 کاراکتر'),
];

export const updateCategoryValidator = [
  param('id').isMongoId().withMessage('شناسه دسته‌بندی معتبر نیست'),
  ...createCategoryValidator.filter((v) => !('location' in v && (v as any).location === 'params')),
];

export const categoryIdParamValidator = [
  param('id').isMongoId().withMessage('شناسه دسته‌بندی معتبر نیست'),
];
