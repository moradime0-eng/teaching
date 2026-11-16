import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';

const router = Router();

// عمومی — همه می‌توانند تنظیمات را ببینند
router.get('/', getSettings);

// ادمین — فقط مدیر می‌تواند تنظیمات را ویرایش کند
router.put('/', authenticate, adminOnly, updateSettings);

export default router;