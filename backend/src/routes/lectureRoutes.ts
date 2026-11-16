/**
 * 📖 Lecture Routes — Nested under /api/v1/courses/:courseId/sections/:sectionId/lectures
 */

import { Router } from 'express';
import {
  createLecture,
  listLectures,
  listAllCourseLectures,
  updateLecture,
  deleteLecture,
  reorderLectures,
  moveLectureToSection,
  addContentItem,
  updateContentItem,
  deleteContentItem,
  reorderContentItems,
} from '../controllers/lectureController';
import { authenticate, optionalAuth } from '../middlewares/auth';
import { instructorOnly } from '../middlewares/authorize';
import { sanitizeRichText } from '../middlewares/sanitize.middleware';

const router = Router({ mergeParams: true }); // mergeParams to access :courseId, :sectionId from parent

// GET /courses/:courseId/sections/:sectionId/lectures — List lectures in a section (public)
router.get('/', optionalAuth, listLectures);

// GET /courses/:courseId/lectures — List all course lectures (flat, public)
router.get('/all', optionalAuth, listAllCourseLectures);

// All write operations require auth + instructor role
router.use(authenticate, instructorOnly);

// POST /courses/:courseId/sections/:sectionId/lectures — Create lecture
router.post('/', sanitizeRichText, createLecture);

// PUT /courses/:courseId/sections/:sectionId/lectures/reorder — Reorder lectures (must be before :lectureId routes)
router.put('/reorder', sanitizeRichText, reorderLectures);

// PUT /courses/:courseId/sections/:sectionId/lectures/:lectureId/move-to-section — Move lecture to another section
router.put('/:lectureId/move-to-section', sanitizeRichText, moveLectureToSection);

// PUT /courses/:courseId/sections/:sectionId/lectures/:lectureId — Update lecture
router.put('/:lectureId', sanitizeRichText, updateLecture);

// DELETE /courses/:courseId/sections/:sectionId/lectures/:lectureId — Delete lecture
router.delete('/:lectureId', deleteLecture);

// ==================== CONTENT ITEMS ROUTES ====================
// POST /courses/:courseId/sections/:sectionId/lectures/:lectureId/content-items — Add content item
router.post('/:lectureId/content-items', sanitizeRichText, addContentItem);

// PUT /courses/:courseId/sections/:sectionId/lectures/:lectureId/content-items/:contentItemId — Update content item
router.put('/:lectureId/content-items/reorder', sanitizeRichText, reorderContentItems);
router.put('/:lectureId/content-items/:contentItemId', sanitizeRichText, updateContentItem);

// DELETE /courses/:courseId/sections/:sectionId/lectures/:lectureId/content-items/:contentItemId — Delete content item
router.delete('/:lectureId/content-items/:contentItemId', deleteContentItem);

// PUT /courses/:courseId/sections/:sectionId/lectures/:lectureId/content-items/reorder — Reorder content items
export default router;