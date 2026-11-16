import { body, param } from 'express-validator';

export const createReviewValidator = [
  body('courseId')
    .optional()
    .isMongoId()
    .withMessage('شناسه دوره معتبر نیست'),

  body('rating')
    .notEmpty()
    .withMessage('امتیاز الزامی است')
    .isInt({ min: 1, max: 5 })
    .withMessage('امتیاز باید بین 1 تا 5 باشد'),

  body('title').optional().isLength({ max: 100 }).withMessage('عنوان نظر حداکثر 100 کاراکتر'),

  body('comment')
    .notEmpty()
    .withMessage('متن نظر الزامی است')
    .isLength({ min: 10, max: 2000 })
    .withMessage('متن نظر باید بین 10 تا 2000 کاراکتر باشد'),
];

export const updateReviewValidator = [
  param('id').isMongoId().withMessage('شناسه نظر معتبر نیست'),

  body('rating').optional().isInt({ min: 1, max: 5 }).withMessage('امتیاز باید بین 1 تا 5 باشد'),

  body('title').optional().isLength({ max: 100 }).withMessage('عنوان نظر حداکثر 100 کاراکتر'),

  body('comment')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .withMessage('متن نظر باید بین 10 تا 2000 کاراکتر باشد'),
];

export const instructorReplyValidator = [
  param('id').isMongoId().withMessage('شناسه نظر معتبر نیست'),

  body('content')
    .notEmpty()
    .withMessage('پاسخ الزامی است')
    .isLength({ max: 1000 })
    .withMessage('پاسخ حداکثر 1000 کاراکتر'),
];
