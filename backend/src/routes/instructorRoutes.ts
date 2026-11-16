import { Router } from 'express';
import {
  getInstructorProfile,
  getInstructorCourses,
  getInstructorReviews,
  getTopInstructors,
} from '../controllers/instructorController';
import { optionalAuth } from '../middlewares/auth';
import { cacheMiddleware } from '../middlewares/cache';

const router = Router();

// Public routes with caching
// ⚠️ مسیرهای ثابت باید قبل از مسیرهای پارامتری ثبت شوند
router.get('/top', cacheMiddleware(300), getTopInstructors);
router.get('/:id/courses', optionalAuth, cacheMiddleware(300), getInstructorCourses);
router.get('/:id/reviews', optionalAuth, cacheMiddleware(300), getInstructorReviews);
router.get('/:id', optionalAuth, cacheMiddleware(300), getInstructorProfile);

export default router;