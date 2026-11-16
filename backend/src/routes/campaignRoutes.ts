import { Router } from 'express';
import {
  getActiveCampaignPublic,
  listCampaigns,
  getCampaignStats,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} from '../controllers/campaignController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { createCampaignValidator, updateCampaignValidator, campaignIdParamValidator } from '../validators/campaignValidator';
import { cacheMiddleware } from '../middlewares/cache';

const router = Router();

/**
 * GET /api/v1/campaigns/active
 * Public endpoint - returns the currently active campaign + serverTime
 * Cached for 30 seconds via cacheMiddleware
 */
router.get('/active', cacheMiddleware(30), getActiveCampaignPublic);

/**
 * Admin-only routes below
 */
router.use(authenticate, adminOnly);

// ⚠️ Must be registered BEFORE '/:id' — otherwise "stats" is treated as a campaign id
router.get('/stats', getCampaignStats);

router.get('/', listCampaigns);
router.get('/:id', validate(campaignIdParamValidator), getCampaignById);
router.post('/', validate(createCampaignValidator), createCampaign);
router.put('/:id', validate(updateCampaignValidator), updateCampaign);
router.delete('/:id', validate(campaignIdParamValidator), deleteCampaign);

export default router;