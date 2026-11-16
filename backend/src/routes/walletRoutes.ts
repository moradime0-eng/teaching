import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { UserRole } from '../types';
import {
  getWalletSummary,
  getWalletTransactions,
  topupWallet,
  requestWithdrawal,
} from '../controllers/walletController';
import {
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  markPaid,
  adjustBalance,
} from '../controllers/adminWalletController';

const router = Router();

// ==================== کاربر (فقط کیف پول خودش — از req.user._id خوانده می‌شود) ====================
router.use(authenticate);
router.get('/', getWalletSummary);
router.get('/transactions', getWalletTransactions);
router.post('/topup', topupWallet);
router.post('/withdraw', requestWithdrawal);

// ==================== ادمین ====================
router.use('/admin', authorize(UserRole.ADMIN));
router.get('/admin/withdrawals', listWithdrawals);
router.post('/admin/withdrawals/:id/approve', approveWithdrawal);
router.post('/admin/withdrawals/:id/reject', rejectWithdrawal);
router.post('/admin/withdrawals/:id/paid', markPaid);
router.post('/admin/wallet/adjust', adjustBalance);

export default router;
