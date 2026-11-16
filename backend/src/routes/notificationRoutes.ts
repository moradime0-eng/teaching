import { Router } from 'express';
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
} from '../controllers/notificationController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// ⚠️ مسیرهای ثابت باید قبل از مسیرهای پارامتری ثبت شوند
router.get('/', getMyNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/all', deleteAllNotifications);
router.delete('/:id', deleteNotification);

export default router;