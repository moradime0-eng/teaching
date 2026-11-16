import { Router } from 'express';
import {
  createReport,
  getAllReports,
  updateReportStatus,
} from '../controllers/reportController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';

const router = Router();

router.use(authenticate);

router.post('/', createReport);
router.get('/', adminOnly, getAllReports);
router.put('/:id', adminOnly, updateReportStatus);

export default router;