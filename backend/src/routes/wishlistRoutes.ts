import { Router } from 'express';
import { getWishlist, toggleWishlist, checkWishlist } from '../controllers/wishlistController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', getWishlist);
router.get('/check/:courseId', checkWishlist);
router.post('/toggle', toggleWishlist);

export default router;