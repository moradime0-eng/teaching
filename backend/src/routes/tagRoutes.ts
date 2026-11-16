import { Router } from 'express';
import { getPopularTags } from '../controllers/tagController';

const router = Router();

// عمومی — همه می‌توانند تگ‌های محبوب را ببینند
router.get('/popular', getPopularTags);

export default router;