import { body, param } from 'express-validator';

export const sendMessageValidator = [
  body('conversationId')
    .notEmpty()
    .withMessage('شناسه مکالمه الزامی است')
    .isMongoId()
    .withMessage('شناسه مکالمه معتبر نیست'),

  body('content')
    .notEmpty()
    .withMessage('متن پیام الزامی است')
    .isLength({ min: 1, max: 5000 })
    .withMessage('متن پیام باید بین 1 تا 5000 کاراکتر باشد'),

  body('replyTo').optional().isMongoId().withMessage('شناسه پیام مرجع معتبر نیست'),
];

export const startConversationValidator = [
  body('recipientId')
    .notEmpty()
    .withMessage('شناسه گیرنده الزامی است')
    .isMongoId()
    .withMessage('شناسه گیرنده معتبر نیست'),

  body('courseId').optional().isMongoId().withMessage('شناسه دوره معتبر نیست'),

  body('content')
    .optional()
    .isLength({ min: 1, max: 5000 })
    .withMessage('متن پیام باید بین 1 تا 5000 کاراکتر باشد'),
];

export const broadcastValidator = [
  body('content')
    .notEmpty()
    .withMessage('متن پیام الزامی است')
    .isLength({ min: 1, max: 5000 })
    .withMessage('متن پیام باید بین 1 تا 5000 کاراکتر باشد'),

  body('recipientIds')
    .optional()
    .isArray()
    .withMessage('لیست گیرندگان باید آرایه باشد'),

  body('recipientIds.*')
    .optional()
    .isMongoId()
    .withMessage('شناسه گیرنده معتبر نیست'),
];
