import { Router } from 'express';
import {
  getCourseDiscussions,
  createDiscussion,
  addReply,
  voteDiscussion,
  deleteDiscussion,
  shareDiscussion,
  getInstructorQuestions,
  getInstructorQuestionCourses,
  getInstructorQuestionStats,
  moderateDiscussion,
} from '../controllers/discussionController';
import { authenticate } from '../middlewares/auth';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';
import { generalLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.use(authenticate);

// ── دریافت پرسش‌های یک دوره (با فیلتر اختیاری درس) ──
// باید قبل از روت‌های پارامتری مانند /:id بیاید
router.get('/course/:courseId', getCourseDiscussions);

// ── پنل پرسش و پاسخ مدرس (باید قبل از /:id بیاید) ──
router.get('/instructor/questions', getInstructorQuestions);
router.get('/instructor/courses', getInstructorQuestionCourses);
router.get('/instructor/stats', getInstructorQuestionStats);

// ── ثبت پرسش جدید ──
router.post('/', generalLimiter, sanitizeRichText, createDiscussion);

// ── پاسخ به پرسش ──
router.post('/:id/replies', generalLimiter, sanitizeRichText, addReply);

// ── رأی مثبت/منفی ──
router.post('/:id/vote', generalLimiter, voteDiscussion);

// ── اشتراک‌گذاری پرسش ──
router.post('/:id/share', generalLimiter, shareDiscussion);

// ── مدیریت پرسش (pin/resolve) توسط مدرس ──
router.patch('/:id/moderate', moderateDiscussion);

// ── حذف پرسش ──
router.delete('/:id', deleteDiscussion);

export default router;
