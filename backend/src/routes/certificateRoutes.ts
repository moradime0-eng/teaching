import { Router } from 'express';
import {
  issueCertificate,
  issueLearningPathCertificate,
  getMyCertificates,
  getCertificateById,
  downloadCertificate,
  verifyCertificate,
  revokeCertificate,
} from '../controllers/certificateController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';

const router = Router();

// Public route
router.get('/verify/:certificateNumber', verifyCertificate);

router.use(authenticate);

router.get('/', getMyCertificates);
router.post('/issue', adminOnly, issueCertificate);
router.post('/issue-learning-path', adminOnly, issueLearningPathCertificate);

// ✅ باید بعد از /verify بیایند ولی قبل از /:id نیستند (پارامتر صریح دارند)
router.get('/:id/download', downloadCertificate);
router.get('/:id', getCertificateById);

router.put('/:id/revoke', adminOnly, revokeCertificate);

export default router;
