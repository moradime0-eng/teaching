import { Router } from 'express';
import { getTenantBranding } from '../controllers/tenantController';

const router = Router();

router.get('/branding', getTenantBranding);

export default router;