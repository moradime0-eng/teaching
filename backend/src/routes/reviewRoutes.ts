import { Router } from 'express';
import {
  createReview,
  getCourseReviews,
  getTopReviews,
  updateReview,
  deleteReview,
  likeReview,
} from '../controllers/reviewController';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  createReviewValidator,
  updateReviewValidator,
} from '../validators/reviewValidator';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';

const router = Router();

// دریافت نظرات برتر (برای صفحه لندینگ — بدون احراز هویت)
router.get('/top', optionalAuth, getTopReviews);

// دریافت نظرات یک دوره با pagination
router.get('/course/:courseId', optionalAuth, getCourseReviews);

// ثبت نظر جدید (نیاز به احراز هویت)
router.post('/', authenticate, validate(createReviewValidator), sanitizeRichText, createReview);

// ثبت نظر با slug دوره
router.post('/course/:slug', authenticate, validate(createReviewValidator), sanitizeRichText, createReview);

// ویرایش نظر (فقط مالک)
router.put('/:id', authenticate, validate(updateReviewValidator), sanitizeRichText, updateReview);

// حذف نظر (مالک یا ادمین)
router.delete('/:id', authenticate, deleteReview);

// لایک/دیس‌لایک نظر
router.post('/:id/like', authenticate, likeReview);

export default router;