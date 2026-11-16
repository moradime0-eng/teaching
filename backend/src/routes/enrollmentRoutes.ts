import { Router } from 'express';
import {
  getMyEnrollments,
  checkEnrollmentStatus,
  enrollInFreeCourse,
} from '../controllers/enrollmentController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', getMyEnrollments);
router.get('/check/:courseId', checkEnrollmentStatus);
router.post('/free', enrollInFreeCourse);

export default router;