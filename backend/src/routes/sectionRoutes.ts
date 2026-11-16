/**
 * 📚 Section Routes — Nested under /api/v1/courses/:courseId/sections
 */

import { Router } from 'express';
import {
  createSection,
  listSections,
  updateSection,
  deleteSection,
  reorderSections,
} from '../controllers/sectionController';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { instructorOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

const router = Router({ mergeParams: true }); // mergeParams to access :courseId from parent

// GET /courses/:courseId/sections — List all sections (public)
router.get('/', optionalAuth, listSections);

// All write operations require auth + instructor role
router.use(authenticate, instructorOnly);

// POST /courses/:courseId/sections — Create section
router.post('/', createSection);

// PUT /courses/:courseId/sections/reorder — Reorder sections (must be before :sectionId routes)
router.put('/reorder', reorderSections);

// PUT /courses/:courseId/sections/:sectionId — Update section
router.put('/:sectionId', updateSection);

// DELETE /courses/:courseId/sections/:sectionId — Delete section
router.delete('/:sectionId', deleteSection);

export default router;