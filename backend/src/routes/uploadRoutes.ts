/**
 * 📤 Upload Routes — S3 Presigned URL Upload + Direct Video Streaming
 * ✅ مجهز به اندپوینت عمومی استریم ویدیو و ریدایرکت امن اسناد
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import {
  getPresignedUrl,
  proxyUpload,
  initMultipartUpload,
  completeMultipartUpload,
  abortMultipartUpload,
  getPlaybackUrl,
  refreshPlaybackUrl,
  getProcessingStatus,
  streamLectureVideo,
  streamPromoVideo, // ✅ استریم ویدیوی معرفی دوره
  serveFile, // ✅ اندپوینت هوشمند لود/دانلود اسناد
  submitDocument,
} from '../controllers/uploadController';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { uploadLimiter } from '../middlewares/rateLimiter';
import { uploadDocument } from '../middlewares/upload';
import { ApiError } from '../utils/ApiError';

const router = Router();

const PROXY_UPLOAD_MAX_SIZE = parseInt(
  process.env.PROXY_UPLOAD_MAX_SIZE || '104857600', // 100MB
  10,
);

const proxyUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROXY_UPLOAD_MAX_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // 🔒 allowlist فرمت‌ها (قبلاً همه فرمت‌ها مجاز بودند — ریسک آپلود HTML/اسکریپت مخرب)
    const allowed =
      /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|txt|mp4|webm|mov|mp3|wav|ogg|m4a|aac|flac)$/i;
    if (allowed.test(path.extname(file.originalname || ''))) {
      cb(null, true);
    } else {
      cb(new ApiError(400, 'فرمت فایل مجاز نیست'));
    }
  },
});

const handleMulterError = (err: any, _req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `خطا در آپلود: ${err.message}` });
  }
  next(err);
};

// ==========================================
// 🟢 ۱. روت‌های عمومی (استریم/فایل) — 🔒 دسترسی داخل کنترلر بررسی می‌شود
// optionalAuth: کوکی/هدر را می‌خواند؛ تگ video هم با توکن ?t= احراز می‌شود
// ==========================================
router.all('/stream/:lectureId', optionalAuth, streamLectureVideo);
router.all('/stream/promo/:courseId', optionalAuth, streamPromoVideo); // ✅ ویدیوی معرفی دوره
router.get('/file/:lectureId', optionalAuth, serveFile); // ✅ اندپوینت هوشمند لود/دانلود اسناد

// ==========================================
// 🔒 ۲. روت‌های حفاظت‌شده و امنیتی
// ==========================================
router.use(authenticate);

router.post(
  '/proxy',
  uploadLimiter,
  proxyUploadMiddleware.single('file'),
  handleMulterError,
  proxyUpload,
);
router.post('/presigned-url', uploadLimiter, getPresignedUrl);
router.post('/multipart/init', uploadLimiter, initMultipartUpload);
router.post('/multipart/complete', completeMultipartUpload);
router.post('/multipart/abort', abortMultipartUpload);
router.get('/playback/:lectureId', getPlaybackUrl);
router.post('/refresh-url', refreshPlaybackUrl);
router.get('/status/:lectureId', getProcessingStatus);

// 📄 آپلود فایل تمرین توسط دانشجو (محدود به ۲۰ مگابایت)
router.post(
  '/document',
  uploadLimiter,
  uploadDocument.single('file'),
  handleMulterError,
  submitDocument,
);

export default router;
