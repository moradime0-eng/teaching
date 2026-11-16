import { Router } from 'express';
import {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} from '../controllers/couponController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { createCouponValidator, couponIdParamValidator } from '../validators/couponValidator';

const router = Router();

router.post('/validate', authenticate, validateCoupon);

router.use(authenticate, adminOnly);

router.post('/', validate(createCouponValidator), createCoupon);
router.get('/', getAllCoupons);
router.get('/:id', validate(couponIdParamValidator), getCouponById);
router.put('/:id', validate(couponIdParamValidator), updateCoupon);
router.delete('/:id', validate(couponIdParamValidator), deleteCoupon);

export default router;
