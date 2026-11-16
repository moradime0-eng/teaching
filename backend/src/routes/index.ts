import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import courseRoutes from './courseRoutes';
import sectionRoutes from './sectionRoutes';
import lectureRoutes from './lectureRoutes';
import enrollmentRoutes from './enrollmentRoutes';
import reviewRoutes from './reviewRoutes';
import categoryRoutes from './categoryRoutes';
import cartRoutes from './cartRoutes';
import wishlistRoutes from './wishlistRoutes';
import paymentRoutes from './paymentRoutes';
import walletRoutes from './walletRoutes';
import couponRoutes from './couponRoutes';
import campaignRoutes from './campaignRoutes';
import notificationRoutes from './notificationRoutes';
import messageRoutes from './messageRoutes';
import progressRoutes from './progressRoutes';
import certificateRoutes from './certificateRoutes';
import reportRoutes from './reportRoutes';
import ticketRoutes from './ticketRoutes';
import dashboardRoutes from './dashboardRoutes';
import searchRoutes from './searchRoutes';
import settingsRoutes from './settingsRoutes';
import tagRoutes from './tagRoutes';
import instructorRoutes from './instructorRoutes';
import tenantRoutes from './tenantRoutes';
import uploadRoutes from './uploadRoutes';
import learningPathRoutes from './learningPathRoutes';
import newsletterRoutes from './newsletterRoutes';
import homeRoutes from './homeRoutes';
import discussionRoutes from './discussionRoutes';


const router = Router();
const apiVersion = '/api/v1';

// ۱. روت برندینگ تننت (باید در ردیف اولین روت‌ها ثبت شود تا ۴۰۴ نگیرد)
router.use(`${apiVersion}/tenant`, tenantRoutes);
router.use(`${apiVersion}/upload`, uploadRoutes);

// ۲. Section & Lecture routes — nested under courses (must be BEFORE generic course routes)
router.use(`${apiVersion}/courses/:courseId/sections`, sectionRoutes);
router.use(`${apiVersion}/courses/:courseId/sections/:sectionId/lectures`, lectureRoutes);

// ۳. سایر روت‌های ماژولار برنامه
router.use(`${apiVersion}/auth`, authRoutes);
router.use(`${apiVersion}/users`, userRoutes);
router.use(`${apiVersion}/courses`, courseRoutes);
router.use(`${apiVersion}/enrollments`, enrollmentRoutes);
router.use(`${apiVersion}/reviews`, reviewRoutes);
router.use(`${apiVersion}/categories`, categoryRoutes);
router.use(`${apiVersion}/cart`, cartRoutes);
router.use(`${apiVersion}/wishlist`, wishlistRoutes);
router.use(`${apiVersion}/payments`, paymentRoutes);
router.use(`${apiVersion}/wallet`, walletRoutes);
router.use(`${apiVersion}/coupons`, couponRoutes);
router.use(`${apiVersion}/campaigns`, campaignRoutes);
router.use(`${apiVersion}/notifications`, notificationRoutes);
router.use(`${apiVersion}/messages`, messageRoutes);
router.use(`${apiVersion}/progress`, progressRoutes);
router.use(`${apiVersion}/certificates`, certificateRoutes);
router.use(`${apiVersion}/reports`, reportRoutes);
router.use(`${apiVersion}/tickets`, ticketRoutes);
router.use(`${apiVersion}/dashboard`, dashboardRoutes);
router.use(`${apiVersion}/search`, searchRoutes);
router.use(`${apiVersion}/settings`, settingsRoutes);
router.use(`${apiVersion}/tags`, tagRoutes);
router.use(`${apiVersion}/instructors`, instructorRoutes);
router.use(`${apiVersion}/learning-paths`, learningPathRoutes);
router.use(`${apiVersion}/newsletter`, newsletterRoutes);
router.use(`${apiVersion}/home`, homeRoutes);
router.use(`${apiVersion}/discussions`, discussionRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'سرور فعال است ✅',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
