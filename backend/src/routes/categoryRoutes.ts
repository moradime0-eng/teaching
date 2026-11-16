import { Router } from 'express';
import {
  createCategory,
  getCategories,
  getCategoryTree,
  getCategoryById,
  updateCategory,
  deleteCategory,
  toggleCategoryActive,
  uploadCategoryIcon,
} from '../controllers/categoryController';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { createCategoryValidator, updateCategoryValidator } from '../validators/categoryValidator';
import { cacheMiddleware, clearCache } from '../middlewares/cache';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';
import { uploadImage } from '../middlewares/upload';
import { uploadLimiter } from '../middlewares/rateLimiter';

const router = Router();

// 💡 میدل‌ور هوشمند برای نادیده گرفتن کش در صورتی که درخواست شامل showAll=true باشد
const smartTreeCache = (req: any, res: any, next: any) => {
  if (req.query.showAll === 'true') {
    return next(); // درخواست ادمین است و نباید از کش خوانده یا در کش ذخیره شود
  }
  // ⚠️ FIX: TTL از ۳۶۰۰ (۱ ساعت) به ۳۰۰ ثانیه (۵ دقیقه) کاهش یافت.
  // با TTL یک‌ساعته، حذف دسته‌بندی از پنل ادمین تا ۱ ساعت در سایت دیده می‌شد.
  return cacheMiddleware(300)(req, res, next);
};

// Public routes
router.get('/', optionalAuth, cacheMiddleware(300), getCategories);
router.get('/tree', optionalAuth, smartTreeCache, getCategoryTree); // 👈 استفاده از کش هوشمند
router.get('/:id', optionalAuth, cacheMiddleware(300), getCategoryById);

// Admin routes
router.use(authenticate, adminOnly);

router.post('/upload-icon', uploadLimiter, uploadImage.single('icon'), uploadCategoryIcon);

// به جای clearCache('*:*/categories*') بنویسید:
router.post('/', validate(createCategoryValidator), sanitizeRichText, clearCache('categories'), createCategory);
router.put('/:id', validate(updateCategoryValidator), sanitizeRichText, clearCache('categories'), updateCategory);
router.delete('/:id', clearCache('categories'), deleteCategory);
router.patch('/:id/toggle-active', clearCache('categories'), toggleCategoryActive);

export default router;
