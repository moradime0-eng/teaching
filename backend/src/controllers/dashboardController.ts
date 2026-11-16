import { Request, Response } from 'express';
import User from '../models/User';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import Payment from '../models/Payment';
import Review from '../models/Review';
import Ticket from '../models/Ticket';
import Wishlist from '../models/Wishlist';
import Certificate from '../models/Certificate';
import LearningPathEnrollment from '../models/LearningPathEnrollment';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { CourseStatus, PaymentStatus, UserRole } from '../types';
import {
  computeBulkCourseRatings,
  applyRatingStatsToCourses,
} from '../services/courseRating.service';

export const getAdminDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    );

    const [
      totalUsers,
      totalStudents,
      totalInstructors,
      totalCourses,
      publishedCourses,
      pendingCourses,
      totalEnrollments,
      totalRevenue,
      monthlyRevenue,
      lastMonthRevenue,
      openTickets,
      newUsersThisMonth,
      recentEnrollments,
      recentPayments,
      recentUsers,
      recentReviews,
      recentTickets,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: UserRole.STUDENT }),
      User.countDocuments({ role: UserRole.INSTRUCTOR }),
      Course.countDocuments(),
      Course.countDocuments({ status: CourseStatus.PUBLISHED }),
      Course.countDocuments({ status: CourseStatus.PENDING }),
      Enrollment.countDocuments({ isRefunded: false }),
      Payment.aggregate([
        // ⚠️ شارژ کیف پول (wallet-topup) درآمد پلتفرم نیست — حذف از گزارش درآمد
        { $match: { status: PaymentStatus.SUCCESS, paymentMethod: { $ne: 'wallet-topup' } } },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: PaymentStatus.SUCCESS,
            paymentMethod: { $ne: 'wallet-topup' },
            createdAt: { $gte: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } },
      ]),
      Payment.aggregate([
        {
          $match: {
            status: PaymentStatus.SUCCESS,
            paymentMethod: { $ne: 'wallet-topup' },
            createdAt: { $gte: startOfLastMonth, $lt: startOfMonth },
          },
        },
        { $group: { _id: null, total: { $sum: '$finalAmount' } } },
      ]),
      Ticket.countDocuments({ status: 'open' }),
      User.countDocuments({ createdAt: { $gte: startOfMonth } }),
      // ─── فعالیت‌های اخیر (ادمین) ───
      Enrollment.find({ isRefunded: false })
        .populate('student', 'fullName')
        .populate('course', 'title')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Payment.find({ status: PaymentStatus.SUCCESS })
        .populate('user', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      User.find()
        .select('fullName role createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Review.find({ isHidden: false })
        .populate('user', 'fullName')
        .populate('course', 'title')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Ticket.find()
        .populate('user', 'fullName')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // ─── ساخت لیست فعالیت‌های اخیر (ادغام + مرتب‌سازی بر اساس زمان) ───
    const activityFeed: {
      type: string;
      icon: string;
      color: string;
      title: string;
      description: string;
      time: Date;
    }[] = [];

    for (const enr of (recentEnrollments as any[]) || []) {
      activityFeed.push({
        type: 'enrollment',
        icon: 'school',
        color: 'blue',
        title: 'ثبت‌نام جدید',
        description: `${enr.student?.fullName || 'یک کاربر'} در دوره "${enr.course?.title || 'بدون عنوان'}" ثبت‌نام کرد.`,
        time: enr.createdAt,
      });
    }

    for (const pay of (recentPayments as any[]) || []) {
      activityFeed.push({
        type: 'payment',
        icon: 'payments',
        color: 'green',
        title: 'پرداخت موفق',
        description: `${pay.user?.fullName || 'یک کاربر'} مبلغ ${pay.finalAmount?.toLocaleString('fa-IR') || 0} تومان پرداخت کرد.`,
        time: pay.createdAt,
      });
    }

    for (const usr of (recentUsers as any[]) || []) {
      activityFeed.push({
        type: 'user',
        icon: 'person_add',
        color: 'purple',
        title: 'کاربر جدید',
        description: `${usr.fullName || 'کاربر جدید'} به عنوان ${usr.role === UserRole.INSTRUCTOR ? 'مدرس' : usr.role === UserRole.ADMIN ? 'ادمین' : 'دانشجو'} ثبت‌نام کرد.`,
        time: usr.createdAt,
      });
    }

    for (const rev of (recentReviews as any[]) || []) {
      activityFeed.push({
        type: 'review',
        icon: 'star',
        color: 'amber',
        title: 'نظر جدید',
        description: `${rev.user?.fullName || 'یک کاربر'} به دوره "${rev.course?.title || 'بدون عنوان'}" ${rev.rating} ستاره داد.`,
        time: rev.createdAt,
      });
    }

    for (const tkt of (recentTickets as any[]) || []) {
      activityFeed.push({
        type: 'ticket',
        icon: 'support_agent',
        color: 'rose',
        title: 'تیکت جدید',
        description: `${tkt.user?.fullName || 'یک کاربر'} تیکت "${tkt.subject}" ایجاد کرد.`,
        time: tkt.createdAt,
      });
    }

    const recentActivities = activityFeed
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10)
      .map((a) => ({ ...a, time: a.time.toISOString() }));

    return ApiResponse.success(res, {
      users: {
        total: totalUsers,
        students: totalStudents,
        instructors: totalInstructors,
        newThisMonth: newUsersThisMonth,
      },
      courses: {
        total: totalCourses,
        published: publishedCourses,
        pending: pendingCourses,
      },
      enrollments: { total: totalEnrollments },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        thisMonth: monthlyRevenue[0]?.total || 0,
        lastMonth: lastMonthRevenue[0]?.total || 0,
      },
      tickets: { open: openTickets },
      recentActivities,
    });
  },
);

export const getInstructorDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const instructorId = req.user._id;

    const instructorCourseIds = await Course.find({
      instructor: instructorId,
    }).distinct('_id');

    const [
      totalCourses,
      publishedCourses,
      draftCourses,
      pendingCourses,
      totalStudents,
      totalRevenue,
      recentEnrollments,
      monthlyRevenueData,
      instructorCourses,
    ] = await Promise.all([
      Course.countDocuments({ instructor: instructorId }),
      Course.countDocuments({
        instructor: instructorId,
        status: CourseStatus.PUBLISHED,
      }),
      Course.countDocuments({
        instructor: instructorId,
        status: CourseStatus.DRAFT,
      }),
      Course.countDocuments({
        instructor: instructorId,
        status: CourseStatus.PENDING,
      }),
      Enrollment.countDocuments({
        course: { $in: instructorCourseIds },
        isRefunded: false,
      }),
      Payment.aggregate([
        // ⚠️ FIX: پرداخت‌های free (تخفیف ۱۰۰٪/دوره رایگان) پولی جابجا نمی‌کنند و
        // سهم مدرسشان صفر است — فیلتر می‌شوند تا درآمد کاذب گزارش نشود.
        {
          $match: {
            status: PaymentStatus.SUCCESS,
            paymentMethod: { $ne: 'free' },
          },
        },
        { $unwind: '$items' },
        { $match: { 'items.course': { $in: instructorCourseIds } } },
        {
          $group: {
            _id: null,
            total: { $sum: '$items.instructorShare' },
          },
        },
      ]),
      Enrollment.find({ course: { $in: instructorCourseIds } })
        .populate('student', 'fullName avatar')
        .populate('course', 'title')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Payment.aggregate([
        // ⚠️ FIX: مانند بالا — پرداخت‌های free در درآمد ماهانه‌ی مدرس لحاظ نمی‌شوند
        {
          $match: {
            status: PaymentStatus.SUCCESS,
            paymentMethod: { $ne: 'free' },
          },
        },
        { $unwind: '$items' },
        { $match: { 'items.course': { $in: instructorCourseIds } } },
        {
          $group: {
            _id: { $month: '$createdAt' },
            total: { $sum: '$items.instructorShare' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Course.find({ instructor: instructorId })
        .select(
          '_id title thumbnail totalStudents averageRating totalReviews totalRevenue status rejectionReason createdAt',
        )
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);

    // ⭐ محاسبه ریتینگ واقعی برای دوره‌های مدرس
    const courseIdsForRating = (instructorCourses || []).map(
      (c: any) => c._id,
    );
    const ratingMap = await computeBulkCourseRatings(courseIdsForRating);

    // ⭐ محاسبه میانگین ریتینگ واقعی مدرس
    let avgRatingSum = 0;
    let avgRatingCount = 0;
    let totalReviewsCount = 0;

    // ساخت لیست فعالیت‌های اخیر
    const recentActivities = (recentEnrollments || []).map((enr: any) => ({
      type: 'enrollment',
      icon: 'school',
      color: 'text-blue-500',
      title: 'ثبت‌نام جدید',
      description: `${enr.student?.fullName || 'یک کاربر'} در دوره "${enr.course?.title || 'شما'}" ثبت‌نام کرد.`,
      time: enr.createdAt,
      amount: 0,
    }));

    const formattedCourses = (instructorCourses || []).map(
      (course: any) => {
        const stats = ratingMap.get(course._id.toString());
        const rating = stats?.averageRating || 0;
        const reviews = stats?.totalReviews || 0;

        if (rating > 0) {
          avgRatingSum += rating;
          avgRatingCount++;
        }
        totalReviewsCount += reviews;

        return {
          _id: course._id,
          title: course.title || 'بدون عنوان',
          thumbnail:
            course.thumbnail &&
            !course.thumbnail.startsWith('data:')
              ? course.thumbnail
              : null,
          students: course.totalStudents || 0,
          rating: rating,
          revenue: course.totalRevenue || 0,
          status: course.status,
          rejectionReason: course.rejectionReason || null,
          totalReviews: reviews,
        };
      },
    );

    const calculatedAvgRating =
      avgRatingCount > 0
        ? Math.round((avgRatingSum / avgRatingCount) * 10) / 10
        : 0;

    return ApiResponse.success(res, {
      courses: {
        total: totalCourses,
        published: publishedCourses,
        draft: draftCourses,
        pending: pendingCourses,
      },
      students: totalStudents,
      revenue: totalRevenue[0]?.total || 0,
      averageRating: calculatedAvgRating,
      reviews: totalReviewsCount,
      recentActivities,
      monthlyRevenue: monthlyRevenueData,
      topCourses: formattedCourses,
      recentCourses: formattedCourses,
    });
  },
);

export const getStudentDashboard = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();

    const [
      totalEnrolled,
      enrolledCourses,
      completedCourses,
      inProgressCourses,
      certificates,
    ] = await Promise.all([
      // ⚠️ FIX: تعداد واقعی ثبت‌نام‌ها (قبلاً lengthِ لیستِ limit-شده بود و هرگز >۵ نمی‌شد)
      Enrollment.countDocuments({ student: req.user._id, isRefunded: false }),
      Enrollment.find({ student: req.user._id, isRefunded: false })
        .populate('course', 'title slug thumbnail level progress')
        .sort({ createdAt: -1 })
        .limit(5),
      Enrollment.countDocuments({
        student: req.user._id,
        isCompleted: true,
      }),
      Enrollment.countDocuments({
        student: req.user._id,
        isCompleted: false,
        isRefunded: false,
      }),
      Enrollment.countDocuments({
        student: req.user._id,
        certificateIssued: true,
      }),
    ]);

    return ApiResponse.success(res, {
      enrolledCount: totalEnrolled,
      completedCount: completedCourses,
      inProgressCount: inProgressCourses,
      certificatesCount: certificates,
      recentCourses: enrolledCourses,
    });
  },
);

// ════════════════════════════════════════════════════════════
// GET /dashboard/quick-stats
// شمارنده‌های سبک دراپ‌داون نوار ناوبری — فقط count بدون populate
// ════════════════════════════════════════════════════════════
export const getQuickStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const userId = req.user._id;
  const role = req.user.role || UserRole.STUDENT;

  if (role === UserRole.STUDENT) {
    const [activeCourses, wishlistDoc, pathEnrollments, certificates] =
      await Promise.all([
        // دوره‌های فعال = ثبت‌نام‌های بدون استرداد
        Enrollment.countDocuments({ student: userId, isRefunded: false }),
        Wishlist.findOne({ user: userId }).select('courses').lean(),
        LearningPathEnrollment.find({ user: userId })
          .populate({ path: 'learningPath', select: 'status' })
          .lean(),
        Certificate.countDocuments({ user: userId, isRevoked: false }),
      ]);

    return ApiResponse.success(res, {
      role,
      activeCourses,
      wishlist: wishlistDoc?.courses?.length || 0,
      // مسیرهای آرشیوشده مطابق داشبورد دانشجو شمرده نمی‌شوند
      learningPaths: (pathEnrollments || []).filter(
        (e: any) => e.learningPath && e.learningPath.status !== 'archived',
      ).length,
      certificates,
    });
  }

  // مدرس / مدیر: تعداد دوره‌های خودش
  const [activeCourses, publishedCourses] = await Promise.all([
    Course.countDocuments({ instructor: userId }),
    Course.countDocuments({
      instructor: userId,
      status: CourseStatus.PUBLISHED,
    }),
  ]);

  return ApiResponse.success(res, {
    role,
    activeCourses,
    wishlist: 0,
    learningPaths: 0,
    certificates: 0,
    publishedCourses,
  });
});

export const getRevenueChart = asyncHandler(
  async (req: Request, res: Response) => {
    const { period } = req.query;

    const groupBy =
      period === 'yearly'
        ? {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          }
        : { month: { $month: '$createdAt' } };

    const data = await Payment.aggregate([
      // شارژ کیف پول درآمد نیست — فقط پرداخت دوره‌ها
      { $match: { status: PaymentStatus.SUCCESS, paymentMethod: { $ne: 'wallet-topup' } } },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$finalAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    return ApiResponse.success(res, data);
  },
);

// ==================== PUBLIC PLATFORM STATS ====================
export const getPlatformStats = asyncHandler(
  async (req: Request, res: Response) => {
    const [
      totalStudents,
      totalCourses,
      totalCertificates,
      totalHoursResult,
    ] = await Promise.all([
      User.countDocuments({ role: UserRole.STUDENT }),
      Course.countDocuments({ status: CourseStatus.PUBLISHED }),
      (async () => {
        try {
          const Certificate = require('../models/Certificate');
          return (
            (await Certificate.default?.countDocuments()) || 0
          );
        } catch {
          return 0;
        }
      })(),
      (async () => {
        try {
          const result = await Course.aggregate([
            { $match: { status: CourseStatus.PUBLISHED } },
            {
              $group: {
                _id: null,
                totalDuration: { $sum: '$totalDuration' },
              },
            },
          ]);
          return Math.round(
            (result[0]?.totalDuration || 0) / 3600,
          );
        } catch {
          return 0;
        }
      })(),
    ]);

    return ApiResponse.success(res, {
      totalStudents,
      totalCourses,
      totalCertificates,
      totalHours: totalHoursResult,
    });
  },
);