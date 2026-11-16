// backend/src/middlewares/validate.ts

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { validationResult, ValidationChain, ValidationError } from 'express-validator';

/**
 * Middleware بررسی نتیجه اعتبارسنجی
 */
const checkValidation = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: ValidationError) => ({
      field: (err as any).path || (err as any).param || 'unknown',
      message: err.msg,
    }));

    res.status(400).json({
      success: false,
      statusCode: 400,
      message: 'خطای اعتبارسنجی داده‌ها',
      errors: formattedErrors,
    });
    return; // ← حیاتی: بدون این، hang می‌شود
  }

  next();
};

/**
 * ✅ نسخه دوگانه:
 * 
 * الگوی ۱ — مستقیم در آرایه validators:
 *   export const myValidator = [body('title').notEmpty(), validate];
 * 
 * الگوی ۲ — به عنوان factory در روت:
 *   router.post('/', validate(registerValidator), controller);
 */
export function validate(req: Request, res: Response, next: NextFunction): void;
export function validate(validators: ValidationChain[]): RequestHandler[];
export function validate(
  reqOrValidators: Request | ValidationChain[],
  res?: Response,
  next?: NextFunction,
): void | RequestHandler[] {
  // الگوی ۲: validate(registerValidator) → آرایه validators + check
  if (Array.isArray(reqOrValidators)) {
    return [...reqOrValidators, checkValidation as RequestHandler];
  }

  // الگوی ۱: validate به عنوان middleware مستقیم
  return checkValidation(reqOrValidators, res!, next!);
}