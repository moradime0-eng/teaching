import { Router } from 'express';
import {
  getAdminDashboard,
  getInstructorDashboard,
  getStudentDashboard,
  getQuickStats,
  getRevenueChart,
  getPlatformStats,
} from '../controllers/dashboardController';
import { authenticate } from '../middlewares/auth';
import { adminOnly, instructorOnly } from '../middlewares/authorize';

const router = Router();

// Public platform stats (for homepage)
router.get('/stats', getPlatformStats);

// Protected routes
router.use(authenticate);

router.get('/admin', adminOnly, getAdminDashboard);
router.get('/instructor', instructorOnly, getInstructorDashboard);
router.get('/student', getStudentDashboard);
router.get('/quick-stats', getQuickStats);
router.get('/revenue', adminOnly, getRevenueChart);

export default router;