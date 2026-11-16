import { body } from 'express-validator';

// ==================== Register Validator ====================

export const registerValidator = [
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('نام و نام خانوادگی الزامی است')
    .isLength({ min: 3 })
    .withMessage('نام باید حداقل ۳ کاراکتر باشد')
    .isLength({ max: 100 })
    .withMessage('نام حداکثر ۱۰۰ کاراکتر می‌تواند باشد'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('ایمیل الزامی است')
    .isEmail()
    .withMessage('ایمیل معتبر نیست')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('رمز عبور الزامی است')
    .isLength({ min: 8 })
    .withMessage('رمز عبور باید حداقل ۸ کاراکتر باشد')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('رمز عبور باید شامل حروف بزرگ، کوچک و عدد باشد'),

  body('confirmPassword')
    .optional()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('رمز عبور و تکرار آن مطابقت ندارند');
      }
      return true;
    }),

  body('role')
    .optional()
    .isIn(['student', 'instructor', 'admin'])
    .withMessage('نقش باید دانشجو، مدرس یا ادمین باشد'),

  body('phone')
    .optional()
    .matches(/^09\d{9}$/)
    .withMessage('شماره موبایل معتبر نیست'),
];

// ==================== Login Validator ====================

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('ایمیل الزامی است')
    .isEmail()
    .withMessage('ایمیل معتبر نیست')
    .normalizeEmail(),

  body('password').notEmpty().withMessage('رمز عبور الزامی است'),
];

// ==================== Forgot/Reset Password Validators ====================

export const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('ایمیل الزامی است')
    .isEmail()
    .withMessage('ایمیل معتبر نیست')
    .normalizeEmail(),
];

export const resetPasswordValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('ایمیل الزامی است')
    .isEmail()
    .withMessage('ایمیل معتبر نیست')
    .normalizeEmail(),

  body('otpCode')
    .notEmpty()
    .withMessage('کد بازیابی الزامی است')
    .isLength({ min: 6, max: 6 })
    .withMessage('کد بازیابی باید ۶ رقمی باشد')
    .isNumeric()
    .withMessage('کد بازیابی باید عددی باشد'),

  body('newPassword')
    .notEmpty()
    .withMessage('رمز عبور جدید الزامی است')
    .isLength({ min: 8 })
    .withMessage('رمز عبور باید حداقل ۸ کاراکتر باشد')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('رمز عبور باید شامل حروف بزرگ، کوچک و عدد باشد'),

  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('رمز عبور جدید و تکرار آن مطابقت ندارند');
    }
    return true;
  }),
];

// ==================== Change Password Validator ====================

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('رمز عبور فعلی الزامی است'),

  body('newPassword')
    .notEmpty()
    .withMessage('رمز عبور جدید الزامی است')
    .isLength({ min: 8 })
    .withMessage('رمز عبور باید حداقل ۸ کاراکتر باشد')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('رمز عبور باید شامل حروف بزرگ، کوچک و عدد باشد'),

  body('confirmNewPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('رمز عبور جدید و تکرار آن مطابقت ندارند');
    }
    return true;
  }),
];

// ==================== Refresh Token Validator ====================

export const refreshTokenValidator = [
  body('refreshToken').optional().notEmpty().withMessage('رفرش توکن الزامی است'),
];
