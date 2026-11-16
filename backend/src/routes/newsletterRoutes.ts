import { Router } from 'express';
import { subscribe, unsubscribe, getSubscribers } from '../controllers/newsletterController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';

const router = Router();

// Public
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);

// Admin
router.get('/', authenticate, adminOnly, getSubscribers);

export default router;
