import { Router } from 'express';
import {
  globalSearch,
  searchCourses,
  getSearchSuggestions,
} from '../controllers/searchController';
import { optionalAuth } from '../middlewares/auth';
import { cacheMiddleware } from '../middlewares/cache';

const router = Router();

router.get('/', optionalAuth, cacheMiddleware(60), globalSearch);
router.get('/courses', optionalAuth, cacheMiddleware(120), searchCourses);
router.get('/suggestions', cacheMiddleware(30), getSearchSuggestions);

export default router;