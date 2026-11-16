import { Router } from 'express';
import { getCart, addToCart, removeFromCart } from '../controllers/cartController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', getCart);
router.post('/', addToCart);
router.delete('/:courseId', removeFromCart);

export default router;
