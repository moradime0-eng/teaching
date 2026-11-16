import { Router } from 'express';
import {
  createPayment,
  callbackPayment,
  verifyPaymentEndpoint,
  paymentHistory,
  getPaymentDetails,
  adminAllPayments,
  adminPaymentStats,
  adminRefund,
  calculateFee,
  inquiryPayment,
  reversePaymentEndpoint,
} from '../controllers/paymentController';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  createPaymentValidator,
  verifyPaymentValidator,
  refundPaymentValidator,
  inquiryPaymentValidator,
  calculateFeeValidator,
} from '../validators/paymentValidator';
import { UserRole } from '../types';

const router = Router();

// ==================== Callback (بدون احراز هویت — توسط NikPal فراخوانی می‌شود) ====================
// مستندات NikPal: GET/POST /api/v1/payment/callback — مسیر ما /payments/callback است
// (callbackUrl را خودمان هنگام Create Payment اعلام می‌کنیم)؛ POST صرفاً تدافعی است
// چون بازگشت بانک به‌صورت Redirect 303 مرورگر است و عملاً GET می‌آید.
router.get('/callback', callbackPayment);
router.post('/callback', callbackPayment);

// ==================== احراز هویت برای سایر endpointها ====================
router.use(authenticate);

// ==================== پرداخت کاربر ====================
router.post('/', validate(createPaymentValidator), createPayment);
router.post('/verify', validate(verifyPaymentValidator), verifyPaymentEndpoint);
router.get('/history', paymentHistory);
router.post('/calculate-fee', validate(calculateFeeValidator), calculateFee);

// ==================== جزئیات و استعلام ====================
router.get('/:id', getPaymentDetails);
router.post('/:id/inquiry', validate(inquiryPaymentValidator), inquiryPayment);

// ==================== ادمین ====================
router.get('/admin/all', authorize(UserRole.ADMIN), adminAllPayments);
router.get('/admin/stats', authorize(UserRole.ADMIN), adminPaymentStats);
router.post(
  '/admin/:id/refund',
  authorize(UserRole.ADMIN),
  validate(refundPaymentValidator),
  adminRefund,
);
router.post('/admin/:id/reverse', authorize(UserRole.ADMIN), reversePaymentEndpoint);

export default router;
