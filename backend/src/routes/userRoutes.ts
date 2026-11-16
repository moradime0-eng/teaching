import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  updateInstructorProfile,
  getAllUsers,
  banUser,
  getUserMemberships,
  unbanUser,
  uploadAvatar,
} from '../controllers/userController';
import { authenticate } from '../middlewares/auth';
import { adminOnly } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  updateProfileValidator,
  updateInstructorProfileValidator,
  userIdParamValidator,
} from '../validators/userValidator';
import { uploadImage, uploadAvatar as uploadAvatarMiddleware } from '../middlewares/upload';
import { sanitizeRichText, sanitizeCompactText } from '../middlewares/sanitize.middleware';

const router = Router();

router.use(authenticate);

router.get('/profile', getProfile);
router.get('/memberships', getUserMemberships);
router.put('/profile', validate(updateProfileValidator), sanitizeRichText, updateProfile);
router.put('/profile/avatar', uploadImage.single('avatar'), updateProfile);

// ✅ مسیر آپلود آواتار
router.post('/upload-avatar', uploadAvatarMiddleware.single('avatar'), uploadAvatar);

router.put(
  '/instructor-profile',
  validate(updateInstructorProfileValidator),
  sanitizeRichText,
  updateInstructorProfile,
);

// Admin routes
router.get('/', adminOnly, getAllUsers);
router.put('/:id/ban', adminOnly, validate(userIdParamValidator), sanitizeCompactText, banUser);
router.put('/:id/unban', adminOnly, validate(userIdParamValidator), unbanUser);

export default router;
