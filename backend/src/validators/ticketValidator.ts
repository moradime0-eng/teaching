import { body, param } from 'express-validator';

export const createTicketValidator = [
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('موضوع تیکت الزامی است')
    .isLength({ max: 200 })
    .withMessage('موضوع حداکثر 200 کاراکتر'),

  body('category')
    .notEmpty()
    .withMessage('دسته‌بندی الزامی است')
    .isIn(['technical', 'billing', 'course', 'account', 'other'])
    .withMessage('دسته‌بندی معتبر نیست'),

  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('اولویت معتبر نیست'),

  body('message')
    .notEmpty()
    .withMessage('متن پیام الزامی است')
    .isLength({ min: 10, max: 5000 })
    .withMessage('متن پیام باید بین 10 تا 5000 کاراکتر باشد'),

  body('relatedCourse').optional().isMongoId().withMessage('شناسه دوره معتبر نیست'),
];

export const replyTicketValidator = [
  param('id').isMongoId().withMessage('شناسه تیکت معتبر نیست'),

  body('content')
    .notEmpty()
    .withMessage('متن پاسخ الزامی است')
    .isLength({ min: 5, max: 5000 })
    .withMessage('متن پاسخ باید بین 5 تا 5000 کاراکتر باشد'),
];

export const updateTicketStatusValidator = [
  param('id').isMongoId().withMessage('شناسه تیکت معتبر نیست'),

  body('status')
    .notEmpty()
    .withMessage('وضعیت الزامی است')
    .isIn(['open', 'in_progress', 'resolved', 'closed'])
    .withMessage('وضعیت معتبر نیست'),
];
