import { Router } from 'express';
import {
  updateProgress,
  getCourseProgress,
  submitQuiz,
  addNote,
  submitAssignment,
  getAssignmentStatus,
} from '../controllers/progressController';
import { authenticate } from '../middlewares/auth';
import { generalLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.use(authenticate);

router.put('/', updateProgress);
router.get('/course/:courseId', getCourseProgress);
router.post('/quiz', generalLimiter, submitQuiz);
router.post('/note', generalLimiter, addNote);

// ── تمرین ──
router.post('/assignment', generalLimiter, submitAssignment);
router.get('/assignment/:lectureId', getAssignmentStatus);

export default router;
