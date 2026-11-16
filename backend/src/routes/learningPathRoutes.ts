// backend/src/routes/learningPathRoutes.ts

import { Router } from 'express';
import {
  createLearningPath,
  getAllLearningPaths,
  getAllLearningPathsAdmin,
  getPublicStatsOverview,
  getLearningPathBySlug,
  getLearningPathById,
  updateLearningPath,
  deleteLearningPath,
  publishLearningPath,
  archiveLearningPath,
  duplicateLearningPath,
  addStage,
  updateStage,
  removeStage,
  reorderStages,
  addCourseToStage,
  removeCourseFromStage,
  reorderCoursesInStage,
  getAvailableCourses,
  enrollInLearningPath,
  getMyLearningPaths,
  getLearningPathProgress,
  updateLearningPathProgress,
  getLearningPathStats,
  previewLearningPath,
  uploadLearningPathCover,
  uploadLearningPathCoverTemp,
  searchForAssignment,
  getDetailsForAssignment,
  quickCreate,
  getLearningPathsWithCourse,
} from '../controllers/learningPathController';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { authenticate, optionalAuth } from '../middlewares/auth'; // ✅ optionalAuth
import { adminOnly } from '../middlewares/authorize';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';
import {
  createLearningPathValidator,
  updateLearningPathValidator,
  addStageValidator,
  addCourseToStageValidator,
  reorderStagesValidator,
  reorderCoursesValidator,
  quickCreateValidator,
} from '../validators/learningPathValidator';

const router = Router();

// ─── Multer for cover images ───
const coverStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `lp-cover-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const coverUpload = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('فقط فایل‌های JPEG, PNG و WebP مجاز هستند'));
  },
});

// ═══════════════════════════════════════════
// عمومی
// ═══════════════════════════════════════════
router.get('/', getAllLearningPaths);
router.get('/my', authenticate, getMyLearningPaths);
router.get('/available-courses', authenticate, adminOnly, getAvailableCourses);
router.get('/search-for-assignment', authenticate, adminOnly, searchForAssignment);
router.get('/with-course/:courseId', authenticate, adminOnly, getLearningPathsWithCourse);
// ✅ FIX #2: باید قبل از /:slug ثبت شود
router.get('/stats/overview', getPublicStatsOverview);

// ═══════════════════════════════════════════
// ادمین — لیست/جزئیات
// ═══════════════════════════════════════════
router.get('/admin/all', authenticate, adminOnly, getAllLearningPathsAdmin);
router.get('/admin/:id', authenticate, adminOnly, getLearningPathById);

// ═══════════════════════════════════════════
// ادمین — ایجاد
// ═══════════════════════════════════════════
router.post('/', authenticate, adminOnly, createLearningPathValidator, sanitizeRichText, createLearningPath);
router.post('/quick-create', authenticate, adminOnly, quickCreateValidator, sanitizeRichText, quickCreate);

// ═══════════════════════════════════════════
// آپلود
// ═══════════════════════════════════════════
router.post(
  '/upload-cover-temp',
  authenticate,
  adminOnly,
  coverUpload.single('cover'),
  uploadLearningPathCoverTemp,
);
router.post(
  '/:id/cover',
  authenticate,
  adminOnly,
  coverUpload.single('cover'),
  uploadLearningPathCover,
);

// ═══════════════════════════════════════════
// جزئیات — باید قبل از /:slug بیایند
// ═══════════════════════════════════════════
router.get('/:id/details-for-assignment', authenticate, adminOnly, getDetailsForAssignment);
router.get('/:id/preview', authenticate, adminOnly, previewLearningPath);
router.get('/:id/progress', authenticate, getLearningPathProgress);
router.patch('/:id/progress', authenticate, updateLearningPathProgress);
router.get('/:id/stats', authenticate, adminOnly, getLearningPathStats);

// ═══════════════════════════════════════════
// ✅ FIX #2: optionalAuth for slug detail
// ═══════════════════════════════════════════
router.get('/:slug', optionalAuth, getLearningPathBySlug);

// ═══════════════════════════════════════════
// ادمین — CRUD
// ═══════════════════════════════════════════
router.put('/:id', authenticate, adminOnly, updateLearningPathValidator, sanitizeRichText, updateLearningPath);
router.delete('/:id', authenticate, adminOnly, deleteLearningPath);
router.patch('/:id/publish', authenticate, adminOnly, publishLearningPath);
router.patch('/:id/archive', authenticate, adminOnly, archiveLearningPath);
router.post('/:id/duplicate', authenticate, adminOnly, duplicateLearningPath);

// ═══════════════════════════════════════════
// مراحل
// ═══════════════════════════════════════════
router.post('/:id/stages', authenticate, adminOnly, addStageValidator, sanitizeRichText, addStage);
router.put('/:id/stages/:stageId', authenticate, adminOnly, sanitizeRichText, updateStage);
router.delete('/:id/stages/:stageId', authenticate, adminOnly, removeStage);
router.patch('/:id/stages/reorder', authenticate, adminOnly, reorderStagesValidator, reorderStages);

// ═══════════════════════════════════════════
// دوره‌ها در مراحل
// ═══════════════════════════════════════════
router.post(
  '/:id/stages/:stageId/courses',
  authenticate,
  adminOnly,
  addCourseToStageValidator,
  addCourseToStage,
);
router.delete(
  '/:id/stages/:stageId/courses/:courseNodeId',
  authenticate,
  adminOnly,
  removeCourseFromStage,
);
router.patch(
  '/:id/stages/:stageId/courses/reorder',
  authenticate,
  adminOnly,
  reorderCoursesValidator,
  reorderCoursesInStage,
);

// ═══════════════════════════════════════════
// ثبت‌نام
// ═══════════════════════════════════════════
router.post('/:id/enroll', authenticate, enrollInLearningPath);

export default router;