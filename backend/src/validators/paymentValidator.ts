import { body, param } from 'express-validator';

export const createPaymentValidator = [
  body('courseId').optional().isMongoId().withMessage('شناسه دوره معتبر نیست'),

  body('courseIds').optional().isArray({ min: 1 }).withMessage('حداقل یک دوره باید انتخاب شود'),

  body('courseIds.*').optional().isMongoId().withMessage('شناسه دوره معتبر نیست'),

  body('couponCode').optional().isString().withMessage('کد تخفیف باید متنی باشد'),

  body('paymentMethod')
    .notEmpty()
    .withMessage('روش پرداخت الزامی است')
    .isIn(['nikpal', 'zarinpal', 'wallet', 'free'])
    .withMessage('روش پرداخت معتبر نیست'),
];

export const verifyPaymentValidator = [
  // پذیرش paymentId (NikPal) یا authority (سازگاری با کلاینت قدیمی)
  body('paymentId').optional().isString().withMessage('شناسه تراکنش باید متنی باشد'),

  body('authority').optional().isString().withMessage('شناسه تراکنش باید متنی باشد'),

  body().custom((body) => {
    if (!body.paymentId && !body.authority) {
      throw new Error('شناسه تراکنش (paymentId) الزامی است');
    }
    return true;
  }),

  // وضعیت اختیاری است: در صورت ارسال باید PAID باشد
  body('status').optional().isString().withMessage('وضعیت پرداخت باید متنی باشد'),
];

export const refundPaymentValidator = [
  body('reason')
    .notEmpty()
    .withMessage('دلیل بازپرداخت الزامی است')
    .isString()
    .isLength({ min: 3 })
    .withMessage('دلیل بازپرداخت باید حداقل 3 کاراکتر باشد'),
];

export const inquiryPaymentValidator = [
  param('id').isMongoId().withMessage('شناسه تراکنش معتبر نیست'),
];

export const calculateFeeValidator = [
  body('amount')
    .notEmpty()
    .withMessage('مبلغ الزامی است')
    .isFloat({ gt: 0 })
    .withMessage('مبلغ باید بزرگ‌تر از صفر باشد'),
];
