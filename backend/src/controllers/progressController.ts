import { Request, Response } from 'express';
import Progress from '../models/Progress';
import Enrollment from '../models/Enrollment';
import Lecture from '../models/Lecture';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import redis from '../config/redis';
import { LearningPathProgressService } from '../services/learningPathProgress.service';

/**
 * Build a Redis key for buffering progress updates.
 * Pattern: progress:{userId}:{courseId}:{lectureId}
 */
const progressKey = (userId: string, courseId: string, lectureId: string) =>
  `progress:${userId}:${courseId}:${lectureId}`;

export const updateProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId, watchedDuration, lastPosition, isCompleted } = req.body;

  // Check enrollment (admin bypass)
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    isRefunded: false,
  });
  if (!enrollment && req.user.role !== 'admin') {
    throw ApiError.forbidden('شما در این دوره ثبت‌نام نکرده‌اید');
  }

  // IMPORTANT: Completion events write directly to MongoDB (critical event)
  if (isCompleted) {
    const progress = await Progress.findOneAndUpdate(
      { user: req.user._id, course: courseId, lecture: lectureId },
      {
        $set: {
          watchedDuration: watchedDuration || 0,
          lastPosition: lastPosition || 0,
          isCompleted: true,
          completedAt: new Date(),
        },
      },
      { new: true, upsert: true },
    );

    // ✅ FIX: افزودن شرط بررسی وجود enrollment برای جلوگیری از بروز باگ خطای TypeScript
    if (enrollment) {
      const lecture = await Lecture.findById(lectureId);

      // ⚠️ FIX CRITICAL: completedLectures از نوع ObjectId[] است ولی lectureId یک string است.
      // متد includes() مقایسه‌ی سخت‌گیرانه (===) دارد، پس همیشه false برمی‌گرداند و باعث
      // push تکراری، progress > 100 و در نتیجه ValidationError (max: 100) و خطای 500 می‌شد.
      const alreadyCompleted = enrollment.completedLectures.some(
        (id) => id.toString() === lectureId.toString(),
      );

      if (lecture && !alreadyCompleted) {
        enrollment.completedLectures.push(lecture._id);
        enrollment.currentLecture = lecture._id;
        enrollment.lastAccessedAt = new Date();

        const totalLectures = await Lecture.countDocuments({ course: courseId, isPublished: true });

        // ⚠️ FIX: جلوگیری از تقسیم بر صفر و کلمپ کردن مقدار در بازه‌ی [0, 100]
        enrollment.progress =
          totalLectures > 0
            ? Math.min(
                100,
                Math.round((enrollment.completedLectures.length / totalLectures) * 100),
              )
            : 0;

        if (enrollment.progress >= 100) {
          enrollment.isCompleted = true;
          enrollment.completedAt = enrollment.completedAt || new Date();
        }

        // 🎯 FIX: پس از تکمیل دوره، پیشرفت مسیر(های) یادگیری مرتبط نیز به‌روز شود
        await LearningPathProgressService.onCourseCompleted(req.user._id, courseId);

        await enrollment.save();
      }
    }

    // Clear any buffered position data for this lecture (it's now completed)
    const key = progressKey(req.user._id.toString(), courseId, lectureId);
    await redis.del(key).catch(() => {});

    return ApiResponse.success(res, { progress, enrollment }, 'درس تکمیل شد');
  }

  // NON-COMPLETION: Buffer position updates in Redis (flush to MongoDB periodically)
  if (redis.isConnected && redis.client) {
    const key = progressKey(req.user._id.toString(), courseId, lectureId);
    const data = JSON.stringify({
      watchedDuration: watchedDuration || 0,
      lastPosition: lastPosition || 0,
      ts: Date.now(),
    });
    await (redis.client as any).set(key, data, 'EX', 120).catch(() => {}); // 2 minute TTL as safety

    // ✅ FIX: به‌روزرسانی امن فیلدهای سبکِ فیلد enrollment فقط در صورت وجود آن
    if (enrollment) {
      enrollment.lastAccessedAt = new Date();
      enrollment.currentLecture = lectureId;
      await enrollment.save();
    }

    return ApiResponse.success(res, { buffered: true }, 'پیشرفت ذخیره شد');
  }

  // Fallback: Direct MongoDB write if Redis is unavailable
  const progress = await Progress.findOneAndUpdate(
    { user: req.user._id, course: courseId, lecture: lectureId },
    {
      $set: {
        watchedDuration: watchedDuration || 0,
        lastPosition: lastPosition || 0,
        isCompleted: false,
      },
    },
    { new: true, upsert: true },
  );

  // ✅ FIX: به‌روزرسانی امن فیلدهای enrollment در بخش Fallback دیتابیس
  if (enrollment) {
    enrollment.lastAccessedAt = new Date();
    enrollment.currentLecture = lectureId;
    await enrollment.save();
  }

  return ApiResponse.success(res, { progress, enrollment }, 'پیشرفت بروزرسانی شد');
});

/**
 * Flush buffered progress data from Redis to MongoDB.
 * Called by cron job every 60 seconds.
 */
export const flushProgressToMongoDB = async (): Promise<number> => {
  if (!redis.isConnected || !redis.client) return 0;

  let flushed = 0;

  try {
    // Scan for progress keys
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.client.scan(cursor, 'MATCH', 'progress:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        try {
          const data = await redis.get(key);
          if (!data) continue;

          const parsed = JSON.parse(data);
          // key format: progress:{userId}:{courseId}:{lectureId}
          const parts = key.split(':');
          if (parts.length !== 4) continue;

          const [, userId, courseId, lectureId] = parts;

          await Progress.findOneAndUpdate(
            { user: userId, course: courseId, lecture: lectureId },
            {
              $set: {
                watchedDuration: parsed.watchedDuration || 0,
                lastPosition: parsed.lastPosition || 0,
                isCompleted: false,
              },
            },
            { upsert: true },
          );

          // Remove from Redis after successful write
          await redis.del(key);
          flushed++;
        } catch (err) {
          console.error('Flush progress key error:', key, err);
        }
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error('Flush progress scan error:', err);
  }

  return flushed;
};

export const getCourseProgress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId } = req.params;

  // ✅ دوره رایگان: همه می‌توانند پیشرفت را ببینند (بدون نیاز به ثبت‌نام)
  const course = await Course.findById(courseId).select('isFree');
  if (course?.isFree) {
    const progressRecords = await Progress.find({
      user: req.user._id,
      course: courseId,
    }).populate('lecture', 'title type duration');
    return ApiResponse.success(res, {
      enrollment: null,
      lectures: progressRecords,
    });
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    // ✅ FIX: دانشجوی بازپرداخت‌شده (نرم‌حذف) به پیشرفت دوره دسترسی ندارد
    isRefunded: { $ne: true },
  });

  if (!enrollment && req.user.role !== 'admin') {
    throw ApiError.notFound('شما در این دوره ثبت‌نام نکرده‌اید');
  }

  const progressRecords = await Progress.find({
    user: req.user._id,
    course: courseId,
  }).populate('lecture', 'title type duration');

  return ApiResponse.success(res, {
    enrollment: enrollment
      ? {
          progress: enrollment.progress,
          isCompleted: enrollment.isCompleted,
          completedLecturesCount: enrollment.completedLectures.length,
          totalTimeSpent: enrollment.totalTimeSpent,
        }
      : null,
    lectures: progressRecords,
  });
});

export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId, answers } = req.body;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture || !lecture.quiz) throw ApiError.notFound('آزمون یافت نشد');

  // Calculate score
  const questions = lecture.quiz.questions;
  let correctCount = 0;

  answers.forEach((answer: number, index: number) => {
    if (questions[index] && questions[index].correctAnswer === answer) {
      correctCount++;
    }
  });

  const score = Math.round((correctCount / questions.length) * 100);
  const passed = score >= lecture.quiz.passingScore;

  // Save attempt
  const progress = await Progress.findOneAndUpdate(
    { user: req.user._id, course: courseId, lecture: lectureId },
    {
      $set: { quizScore: score },
      $push: {
        quizAttempts: {
          score,
          attemptedAt: new Date(),
          answers,
        },
      },
      ...(passed && { isCompleted: true, completedAt: new Date() }),
    },
    { new: true, upsert: true },
  );

  return ApiResponse.success(
    res,
    {
      score,
      passed,
      correctCount,
      totalQuestions: questions.length,
      passingScore: lecture.quiz.passingScore,
    },
    passed ? 'تبریک! آزمون را با موفقیت گذراندید' : 'متأسفانه نمره قبولی را کسب نکردید',
  );
});

export const addNote = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId, content, timestamp } = req.body;

  if (!content || !String(content).trim()) {
    throw ApiError.badRequest('متن یادداشت الزامی است');
  }

  const progress = await Progress.findOneAndUpdate(
    { user: req.user._id, course: courseId, lecture: lectureId },
    {
      $push: {
        notes: { content: String(content).trim().slice(0, 1000), timestamp, createdAt: new Date() },
      },
    },
    { new: true, upsert: true },
  );

  return ApiResponse.created(res, progress, 'یادداشت اضافه شد');
});

/**
 * POST /api/v1/progress/assignment
 * ارسال تمرین (متن و/یا فایل) برای درس‌های نوع assignment
 */
export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId, content, fileUrl } = req.body;

  if (!courseId || !lectureId) {
    throw ApiError.badRequest('اطلاعات درس ناقص است');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    isRefunded: false,
  });
  if (!enrollment && req.user.role !== 'admin') {
    throw ApiError.forbidden('شما در این دوره ثبت‌نام نکرده‌اید');
  }

  const lecture = await Lecture.findById(lectureId).select('_id course title');
  if (!lecture || lecture.course.toString() !== courseId.toString()) {
    throw ApiError.notFound('درس یافت نشد');
  }

  const trimmed = String(content || '').trim().slice(0, 5000);
  if (!trimmed && !fileUrl) {
    throw ApiError.badRequest('متن یا فایل پاسخ الزامی است');
  }

  const progress = await Progress.findOneAndUpdate(
    { user: req.user._id, course: courseId, lecture: lectureId },
    {
      $set: {
        assignmentSubmission: {
          content: trimmed,
          fileUrl: fileUrl || undefined,
          submittedAt: new Date(),
        },
      },
    },
    { new: true, upsert: true },
  );

  // ثبت تکمیل درس در صورت ارسال موفق
  const alreadyCompleted = enrollment
    ? enrollment.completedLectures.some((id) => id.toString() === lectureId.toString())
    : true;

  if (!alreadyCompleted) {
    await Progress.findOneAndUpdate(
      { user: req.user._id, course: courseId, lecture: lectureId },
      { $set: { isCompleted: true, completedAt: new Date() } },
    );
  }

  return ApiResponse.created(
    res,
    { progress, lectureTitle: lecture.title },
    'تمرین شما با موفقیت ارسال شد',
  );
});

/**
 * GET /api/v1/progress/assignment/:lectureId
 * وضعیت ارسال تمرین برای یک درس
 */
export const getAssignmentStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { lectureId } = req.params;

  const progress = await Progress.findOne({
    user: req.user._id,
    lecture: lectureId,
    'assignmentSubmission.submittedAt': { $exists: true },
  }).select('assignmentSubmission');

  return ApiResponse.success(res, {
    submitted: !!progress?.assignmentSubmission,
    submission: progress?.assignmentSubmission || null,
  });
});