import { Router } from 'express';
import {
  createCourse,
  getCourseBySlug,
  getCourseById,
  getRelatedCourses,
  updateCourse,
  listCourses,
  submitForReview,
  uploadThumbnail,
  deleteCourse,
} from '../controllers/courseController';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { instructorOnly, adminOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  createCourseValidator,
  courseIdParamValidator,
  courseSlugParamValidator,
} from '../validators/courseValidator';
import { uploadImage } from '../middlewares/upload';
import { cacheMiddleware } from '../middlewares/cache';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';

const router = Router();

// ⚠️ ترتیب روت‌ها بسیار مهم است:
// مسیرهای ثابت و پارامتری خاص باید قبل از مسیرهای عمومی پارامتری باشند

// ==================== 1. PUBLIC ROUTES ====================
// مسیرهای عمومی — بدون احراز هویت اجباری
// optionalAuth: اگر توکن بود کاربر شناسایی می‌شود، اگر نبود خطا نمی‌دهد
router.get('/', optionalAuth, cacheMiddleware(300), listCourses);
router.get('/related/:id', optionalAuth, cacheMiddleware(300), getRelatedCourses);

// ✅ FIX اصلی: روت مشاهده دوره باید قبل از router.use(authenticate) باشد
// یا اصلاً از router.use استفاده نکنیم (که ما این راه را انتخاب کردیم)
//
// دلیل: router.use(authenticate) تمام روت‌های بعدی را مجبور به احراز هویت می‌کند
// و optionalAuth روی روت /:slug بی‌اثر می‌شود.
//
// همچنین cacheMiddleware از این روت حذف شد چون:
// - درخواست اول SSR (بدون توکن) → 404 برای دوره DRAFT → cache می‌شود
// - درخواست دوم Browser (با توکن ادمین) → همان 404 cache شده را می‌گیرد!
router.get('/:slug', optionalAuth, getCourseBySlug);

// ==================== 2. INSTRUCTOR ROUTES ====================
// ✅ FIX: به جای router.use(authenticate) که همه روت‌ها را قفل می‌کند،
// هر روت خصوصی مستقیماً authenticate/instructorOnly دارد

router.post(
  '/',
  authenticate,
  instructorOnly,
  validate(createCourseValidator),
  sanitizeRichText,
  createCourse,
);

router.get(
  '/:id/edit',
  authenticate,
  instructorOnly,
  getCourseById,
);

router.put(
  '/:id',
  authenticate,
  instructorOnly,
  validate(courseIdParamValidator),
  sanitizeRichText,
  uploadImage.single('thumbnail'),
  updateCourse,
);

router.post(
  '/:id/submit',
  authenticate,
  instructorOnly,
  validate(courseIdParamValidator),
  submitForReview,
);

router.post(
  '/:id/thumbnail',
  authenticate,
  instructorOnly,
  validate(courseIdParamValidator),
  uploadImage.single('thumbnail'),
  uploadThumbnail,
);

// ─── آپلود ویدیو و فایل پیوست اکنون از طریق S3 Presigned URL انجام می‌شود ───
// مسیرهای جدید: POST /api/v1/upload/presigned-url + POST /api/v1/upload/multipart/*

// ==================== 3. ADMIN ROUTES ====================
router.delete(
  '/:id',
  authenticate,
  adminOnly,
  validate(courseIdParamValidator),
  deleteCourse,
);

export default router;