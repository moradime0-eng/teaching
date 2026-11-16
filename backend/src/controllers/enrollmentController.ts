import { Request, Response } from 'express';
import Enrollment from '../models/Enrollment';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { invalidateCache } from '../middlewares/cache';

export const enrollUserInCourse = async (
  studentId: string,
  courseId: string,
  pricePaid: number,
  paymentId?: string,
) => {
  // ⚠️ FIX: پیش از این، findOne و سپس create دو مرحله‌ی جدا بودند و بین آن‌ها فاصله
  // وجود داشت. دو درخواست همزمان هر دو null می‌گرفتند و یکی‌شان با خطای
  // E11000 (یونیک ایندکس {student, course}) می‌شکست. upsert این را اتمیک می‌کند.
  const existingEnrollment = await Enrollment.findOne({ student: studentId, course: courseId });
  if (existingEnrollment) return existingEnrollment;

  const upsertResult: any = await Enrollment.findOneAndUpdate(
    { student: studentId, course: courseId },
    {
      $setOnInsert: {
        student: studentId,
        course: courseId,
        pricePaid,
        payment: paymentId,
        isRefunded: false,
      },
    },
    { new: true, upsert: true, includeResultMetadata: true },
  );
  const enrollment = upsertResult?.value ?? upsertResult;

  // 🎯 فقط در صورت اینکه رکورد جدید واقعاً ساخته شده باشد شمارنده افزایش یابد
  // (lastErrorObject.updatedExisting فقط وقتی رکورد از قبل موجود بوده true است)
  const alreadyExisted = upsertResult?.lastErrorObject?.updatedExisting === true;
  if (!alreadyExisted) {
    await Course.findByIdAndUpdate(courseId, {
      $inc: { totalStudents: 1 },
    });
  }

  await invalidateCache([`cache:*courses*`, `cache:*search*`]);

  return enrollment;
};

export const getMyEnrollments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { page, limit, skip } = getPaginationOptions(req);

  const enrollments = await Enrollment.find({ student: req.user._id, isRefunded: false })
    .populate('course', 'title slug thumbnail level totalLectures')
    .skip(skip)
    .limit(limit);

  const total = await Enrollment.countDocuments({ student: req.user._id, isRefunded: false });

  return ApiResponse.paginated(res, enrollments, page, limit, total);
});

export const checkEnrollmentStatus = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    isRefunded: false,
  });

  return ApiResponse.success(res, { enrolled: !!enrollment, enrollment });
});

export const enrollInFreeCourse = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.body;
  if (!req.user) throw ApiError.unauthorized();

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('دوره یافت نشد');
  if (!course.isFree) throw ApiError.badRequest('این دوره رایگان نیست');

  const enrollment = await enrollUserInCourse(req.user._id.toString(), courseId, 0);

  return ApiResponse.success(res, { enrollment }, 'ثبت‌نام در دوره رایگان با موفقیت انجام شد');
});
