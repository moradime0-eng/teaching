import { Router, Request, Response, NextFunction } from 'express';
import {
  register,
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  googleCallback,
  githubCallback,
  changePassword,
  completeRegistration,
} from '../controllers/authController';
import { validate } from '../middlewares/validate';
import { authenticate } from '../middlewares/auth';
import {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
  refreshTokenValidator,
} from '../validators/authValidator';
import { body } from 'express-validator';
import { authLimiter, registerLimiter, resetLimiter } from '../middlewares/rateLimiter';
import passport from 'passport';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import User from '../models/User';

const router = Router();

// ==================== First User Check (public) ====================
// Used by frontend register page to detect if first user should be admin
router.get('/check-first-user', async (_req, res) => {
  // Count only active users (excludes temp placeholder accounts)
  const userCount = await User.countDocuments({ isActive: true });
  return ApiResponse.success(res, { isFirstUser: userCount === 0 }, 'OK');
});

// ==================== Registration ====================
router.post('/register', registerLimiter, validate(registerValidator), register);

// ==================== Login ====================
router.post('/login', authLimiter, validate(loginValidator), login);
router.post('/logout', logout);
router.post('/refresh-token', validate(refreshTokenValidator), refreshToken);

// ==================== Forgot / Reset Password (OTP-based) ====================
router.post('/forgot-password', authLimiter, validate(forgotPasswordValidator), forgotPassword);
router.post('/reset-password', resetLimiter, validate(resetPasswordValidator), resetPassword);

// ==================== Change Password (logged-in) ====================
router.post('/change-password', authenticate, validate(changePasswordValidator), changePassword);

// ==================== Complete Registration (OAuth role selection) ====================
router.post('/complete-registration', authenticate, completeRegistration);

// ==================== Google OAuth ====================
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('google', { session: false }, (err: any, user: any, info: any) => {
      if (err || !user) {
        const frontendUrl =
          process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:4200';
        const reason = encodeURIComponent(err?.message || info?.message || 'no_user');
        return res.redirect(`${frontendUrl}/auth/login?error=google_failed&reason=${reason}`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  googleCallback,
);

// ==================== GitHub OAuth ====================
const isGitHubConfigured = () =>
  !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

const ensureGitHubConfigured = (req: Request, _res: Response, next: NextFunction) => {
  if (!isGitHubConfigured()) {
    return next(ApiError.badRequest('ورود با گیت‌هاب پیکربندی نشده است.'));
  }
  next();
};

router.get('/github', ensureGitHubConfigured, (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('github', {
    scope: ['user:email'],
    session: false,
  })(req, res, next);
});

router.get(
  '/github/callback',
  ensureGitHubConfigured,
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('github', { session: false }, (err: any, user: any) => {
      if (err || !user) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        return res.redirect(`${frontendUrl}/auth/login?error=github_failed`);
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  githubCallback,
);

export default router;
