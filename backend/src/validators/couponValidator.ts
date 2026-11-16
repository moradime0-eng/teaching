import { body, param } from 'express-validator';

export const createCouponValidator = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('کد تخفیف الزامی است')
    .isLength({ min: 3, max: 20 })
    .withMessage('کد تخفیف باید بین 3 تا 20 کاراکتر باشد')
    .matches(/^[A-Z0-9_-]+$/)
    .withMessage('کد تخفیف فقط شامل حروف بزرگ، اعداد و خط تیره باشد'),

  body('description').optional().isLength({ max: 300 }).withMessage('توضیحات حداکثر 300 کاراکتر'),

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
        throw new Error('مبلغ تخفیف باید بزرگتر از صفر باشد');
      }
      return true;
    }),

  body('maxDiscount').optional().isNumeric().withMessage('حداکثر تخفیف باید عددی باشد'),

  body('minPurchase').optional().isNumeric().withMessage('حداقل خرید باید عددی باشد'),

  body('usageLimit').optional().isInt({ min: 1 }).withMessage('محدودیت استفاده باید عدد مثبت باشد'),

  body('usageLimitPerUser')
    .optional()
    .isInt({ min: 1 })
    .withMessage('محدودیت استفاده هر کاربر باید عدد مثبت باشد'),

  body('validFrom')
    .notEmpty()
    .withMessage('تاریخ شروع الزامی است')
    .isISO8601()
    .withMessage('تاریخ شروع معتبر نیست'),

  body('validUntil')
    .notEmpty()
    .withMessage('تاریخ پایان الزامی است')
    .isISO8601()
    .withMessage('تاریخ پایان معتبر نیست')
    .custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.validFrom)) {
        throw new Error('تاریخ پایان باید بعد از تاریخ شروع باشد');
      }
      return true;
    }),

  body('applicableCourses').optional().isArray().withMessage('دوره‌های مشمول باید آرایه باشد'),

  body('applicableCategories')
    .optional()
    .isArray()
    .withMessage('دسته‌بندی‌های مشمول باید آرایه باشد'),

  body('isFirstPurchaseOnly').optional().isBoolean().withMessage('فقط خرید اول باید بولین باشد'),
];

export const applyCouponValidator = [
  body('code').trim().notEmpty().withMessage('کد تخفیف الزامی است'),

  body('courseIds').optional().isArray().withMessage('شناسه دوره‌ها باید آرایه باشد'),
];

export const couponIdParamValidator = [
  param('id').isMongoId().withMessage('شناسه کوپن معتبر نیست'),
];
