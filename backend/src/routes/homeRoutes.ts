import { Router } from 'express';
import {
  getTrendingTags,
  getPopularSearches,
  getHomeFeatures,
  getFAQs,
  getHomeStats,
  getCategoryHighlights,
} from '../controllers/homeController';

const router = Router();

// Public homepage data endpoints
router.get('/trending-tags', getTrendingTags);
router.get('/popular-searches', getPopularSearches);
router.get('/features', getHomeFeatures);
router.get('/faqs', getFAQs);
router.get('/stats', getHomeStats);
router.get('/category-highlights', getCategoryHighlights);

export default router;
