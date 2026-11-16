import { body, param, query } from 'express-validator';

export const updateProfileValidator = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('نام باید بین 3 تا 100 کاراکتر باشد'),

  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .matches(/^09\d{9}$/)
    .withMessage('شماره موبایل معتبر نیست'),

  body('bio')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 300 })
    .withMessage('بیو حداکثر 300 کاراکتر می‌تواند باشد'),

  body('preferredLanguage').optional().isIn(['fa', 'en']).withMessage('زبان معتبر نیست'),

  body('timezone').optional().isString().withMessage('منطقه زمانی معتبر نیست'),
];

export const updateInstructorProfileValidator = [
  body('headline')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('عنوان حداکثر 200 کاراکتر'),

  body('biography')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 3000 })
    .withMessage('بیوگرافی حداکثر 3000 کاراکتر'),

  body('website')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('آدرس وبسایت معتبر نیست'),

  body('socialLinks.linkedin')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('لینک لینکدین معتبر نیست'),

  body('socialLinks.twitter')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('لینک توییتر معتبر نیست'),

  body('socialLinks.youtube')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('لینک یوتیوب معتبر نیست'),

  body('socialLinks.instagram')
    .optional({ nullable: true, checkFalsy: true })
    .isURL()
    .withMessage('لینک اینستاگرام معتبر نیست'),

  body('expertise').optional({ nullable: true }).isArray().withMessage('تخصص‌ها باید آرایه باشد'),
];

export const userIdParamValidator = [param('id').isMongoId().withMessage('شناسه کاربر معتبر نیست')];

export const userQueryValidator = [
  query('role').optional().isIn(['student', 'instructor', 'admin']).withMessage('نقش معتبر نیست'),

  query('isActive').optional().isBoolean().withMessage('وضعیت فعال معتبر نیست'),

  query('search').optional().isString().withMessage('جستجو باید متنی باشد'),
];

export const banUserValidator = [
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('دلیل مسدودسازی حداکثر 500 کاراکتر'),
];
