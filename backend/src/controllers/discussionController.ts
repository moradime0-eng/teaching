import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Discussion from '../models/Discussion';
import Course from '../models/Course';
import Lecture from '../models/Lecture';
import Enrollment from '../models/Enrollment';
import User from '../models/User';
import { NotificationType } from '../types';
import { createNotification } from './notificationController';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getIO } from '../config/socket';

const getTenantId = (req: Request): mongoose.Types.ObjectId | undefined => {
  const user = req.user as any;
  const tenant =
    (req as any).tenant?._id || (req as any).tenantId || user?.activeTenant || user?.tenant;
  return tenant ? new mongoose.Types.ObjectId(tenant.toString()) : undefined;
};

/** استخراج شناسه مدرس دوره (پشتیبانی از populate و ObjectId خام) */
const getCourseInstructorId = (course: any): string | null => {
  if (!course?.instructor) return null;
  if (typeof course.instructor === 'object') {
    return (course.instructor._id || course.instructor).toString();
  }
  return course.instructor.toString();
};

/**
 * آیا کاربر مالک/مدرس این دوره است؟ (ادمین همیشه دسترسی دارد)
 * این تابع مرجعِ واحد برای تمام بررسی‌های مالکیت در این کنترلر است.
 */
const isCourseOwner = (req: Request, course: any): boolean => {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;

  const uid = req.user._id.toString();
  const ownerId = getCourseInstructorId(course);

  if (ownerId === uid) return true;

  // مدرسان همکار (co-instructor) نیز مالک محسوب می‌شوند
  const coIds: string[] = Array.isArray(course?.coInstructors)
    ? course.coInstructors
        .map((c: any) => (typeof c === 'object' ? (c?._id ?? c) : c))
        .filter(Boolean)
        .map((c: any) => c.toString())
    : [];
  return coIds.includes(uid);
};

/**
 * بررسی دسترسی کاربر به محتوای دوره.
 * دوره رایگان → همه؛ غیر رایگان → ثبت‌نام‌کننده/ادمین/مدرس.
 */
const assertCourseAccess = async (req: Request, courseId: string) => {
  if (!req.user) throw ApiError.unauthorized();

  const course = await Course.findById(courseId).select(
    'instructor coInstructors isFree title slug',
  );
  if (!course) throw ApiError.notFound('دوره مورد نظر یافت نشد');

  const isOwner = isCourseOwner(req, course);

  if (course.isFree || isOwner) return { course, isInstructor: isOwner };

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    isRefunded: false,
  }).select('_id');

  if (!enrollment) {
    throw ApiError.forbidden('برای مشارکت در این بخش باید در دوره ثبت‌نام کنید');
  }

  return { course, isInstructor: false };
};

/** ارسال نوتیفیکیشن بدون اینکه خطای آن درخواست اصلی را بشکند */
const safeNotify = async (
  req: Request,
  payload: {
    recipient: string;
    title: string;
    message: string;
    link?: string;
    type?: NotificationType;
    data?: Record<string, unknown>;
  },
) => {
  try {
    const tenantId = getTenantId(req);
    // ⚠️ FIX: استفاده از createNotification مشترک — قبلاً رویداد غلط «notification»
    // emit می‌شد در حالی که فرانت‌اند «new_notification» را گوش می‌دهد؛
    // همچنین بج شمارنده (unread_count) اکنون به‌روز می‌شود.
    await createNotification({
      recipient: payload.recipient,
      sender: req.user?._id?.toString(),
      type: payload.type ?? NotificationType.COURSE_UPDATE,
      title: payload.title,
      message: payload.message,
      link: payload.link,
      data: payload.data,
      tenant: tenantId?.toString(),
    });
  } catch {
    // نوتیفیکیشن نباید باعث خطای درخواست اصلی شود
  }
};

/** لینک صندوق پرسش‌های مدرس (نه کلاس‌روم دانشجو) */
const instructorInboxLink = (courseId: any) => `/instructor/questions?course=${courseId}`;

/** نگاشت Discussion به فرمت مورد انتظار فرانت‌اند */
function mapDiscussion(obj: any) {
  return {
    ...obj,
    _id: obj._id?.toString(),
    course: obj.course?._id?.toString?.() ?? obj.course?.toString?.(),
    lecture: obj.lecture?._id?.toString?.() ?? obj.lecture?.toString?.() ?? null,
    user: obj.user ? { ...obj.user, _id: obj.user._id?.toString?.() ?? obj.user._id } : null,
    replies: (obj.replies || []).map((r: any) => ({
      ...r,
      _id: r._id?.toString?.() ?? r._id,
      user: r.user ? { ...r.user, _id: r.user._id?.toString?.() ?? r.user._id } : null,
      upvotesCount: (r.upvotes || []).length,
      downvotesCount: (r.downvotes || []).length,
    })),
    upvotesCount: (obj.upvotes || []).length,
    downvotesCount: (obj.downvotes || []).length,
    replyCount: (obj.replies || []).length,
  };
}

/**
 * GET /api/v1/discussions/course/:courseId?lectureId=&courseWide=&page=&limit=
 * لیست پرسش‌ها و پاسخ‌های یک دوره
 */
export const getCourseDiscussions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId } = req.params;
  const { lectureId, courseWide, page, limit } = req.query as Record<string, string>;

  const filter: any = { course: courseId, type: 'question' };

  if (lectureId && lectureId !== 'all' && courseWide !== 'true') {
    filter.$or = [{ lecture: lectureId }, { lecture: { $exists: false } }, { lecture: null }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    Discussion.find(filter)
      .populate('user', 'fullName avatar role')
      .populate('replies.user', 'fullName avatar role')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Discussion.countDocuments(filter),
  ]);

  const userId = req.user._id.toString();
  const enriched = items.map((raw: any) => {
    const d = mapDiscussion(raw);
    return {
      ...d,
      hasUpvoted: (raw.upvotes || []).some((u: any) => u.toString() === userId),
      hasDownvoted: (raw.downvotes || []).some((u: any) => u.toString() === userId),
      replies: (d.replies || []).map((r: any, idx: number) => ({
        ...r,
        hasUpvoted: ((raw.replies?.[idx]?.upvotes || []) as any[]).some(
          (u: any) => u.toString() === userId,
        ),
        hasDownvoted: ((raw.replies?.[idx]?.downvotes || []) as any[]).some(
          (u: any) => u.toString() === userId,
        ),
      })),
    };
  });

  return ApiResponse.paginated(res, enriched, pageNum, limitNum, total, 'پرسش‌ها دریافت شد');
});

/**
 * POST /api/v1/discussions
 * ثبت پرسش جدید
 */
export const createDiscussion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { courseId, lectureId, title, content } = req.body;

  if (!courseId || !content || !String(content).trim()) {
    throw ApiError.badRequest('متن پرسش الزامی است');
  }

  await assertCourseAccess(req, courseId);

  if (lectureId) {
    const lecture = await Lecture.findById(lectureId).select('_id course');
    if (!lecture || lecture.course.toString() !== courseId.toString()) {
      throw ApiError.badRequest('درس انتخاب‌شده معتبر نیست');
    }
  }

  const payload: any = {
    course: courseId,
    lecture: lectureId || undefined,
    user: req.user._id,
    title: String(title || String(content).slice(0, 80))
      .trim()
      .slice(0, 200),
    content: String(content).trim().slice(0, 5000),
    type: 'question',
  };
  const tenantId = getTenantId(req);
  if (tenantId) payload.tenant = tenantId;

  const discussion = await Discussion.create(payload);
  await discussion.populate('user', 'fullName avatar role');

  // اطلاع‌رسانی به مدرس (و مدرسان همکار) دوره + انتشار رویداد سوکت
  const course = await Course.findById(courseId).select('instructor coInstructors');
  const recipients = new Set<string>();
  const ownerId = getCourseInstructorId(course);
  if (ownerId) recipients.add(ownerId);
  const coIds: string[] = Array.isArray(course?.coInstructors)
    ? course.coInstructors
        .map((c: any) => (typeof c === 'object' ? (c?._id ?? c) : c))
        .filter(Boolean)
        .map((c: any) => c.toString())
    : [];
  coIds.forEach((id) => recipients.add(id));
  recipients.delete(req.user._id.toString());

  for (const recipient of recipients) {
    await safeNotify(req, {
      recipient,
      type: NotificationType.QA_QUESTION,
      title: 'پرسش جدید در دوره شما',
      message: `${req.user.fullName}: ${payload.title}`,
      link: instructorInboxLink(courseId),
      data: { discussionId: discussion._id.toString(), courseId: String(courseId) },
    });
    try {
      getIO()
        ?.to(`user:${recipient}`)
        .emit('qa:new-question', {
          discussionId: discussion._id.toString(),
          courseId: String(courseId),
          title: payload.title,
        });
    } catch {
      // سوکت فعال نیست
    }
  }

  const obj = mapDiscussion(discussion.toObject() as any);
  return ApiResponse.created(
    res,
    { ...obj, hasUpvoted: false, hasDownvoted: false },
    'پرسش شما با موفقیت ثبت شد',
  );
});

/**
 * POST /api/v1/discussions/:id/replies
 * پاسخ به پرسش (دانشجو یا مدرس)
 */
export const addReply = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { id } = req.params;
  const { content } = req.body;

  if (!content || !String(content).trim()) {
    throw ApiError.badRequest('متن پاسخ الزامی است');
  }

  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('پرسش یافت نشد');

  const { isInstructor } = await assertCourseAccess(req, discussion.course.toString());

  discussion.replies.push({
    user: req.user._id,
    content: String(content).trim().slice(0, 3000),
    isInstructorReply: isInstructor,
    upvotes: [],
    downvotes: [],
  } as any);

  await discussion.save();
  await discussion.populate('user', 'fullName avatar role');
  await discussion.populate('replies.user', 'fullName avatar role');

  const link = `/learn/${discussion.course}${discussion.lecture ? `?lecture=${discussion.lecture}` : ''}`;

  // ۱) اگر پاسخ‌دهنده مدرس است → به صاحب پرسش اطلاع می‌دهیم
  const ownerId = discussion.user?._id?.toString();
  if (ownerId && ownerId !== req.user._id.toString()) {
    await safeNotify(req, {
      recipient: ownerId,
      type: NotificationType.QA_REPLY,
      title: 'پاسخ جدید به پرسش شما',
      message: `${req.user.fullName} به پرسش «${discussion.title}» پاسخ داد`,
      link,
      data: { discussionId: discussion._id.toString() },
    });
  }

  // ۲) اگر پاسخ‌دهنده دانشجو است → مدرس دوره را هم در جریان می‌گذاریم
  //    تا اگر خودش پرسش را unanswered رها کرده، مطلع شود.
  if (!isInstructor) {
    const course = await Course.findById(discussion.course).select('instructor coInstructors');
    const targets = new Set<string>();
    const courseOwner = getCourseInstructorId(course);
    if (courseOwner) targets.add(courseOwner);
    const coIds: string[] = Array.isArray(course?.coInstructors)
      ? course.coInstructors
          .map((c: any) => (typeof c === 'object' ? (c?._id ?? c) : c))
          .filter(Boolean)
          .map((c: any) => c.toString())
      : [];
    coIds.forEach((cid) => targets.add(cid));

    if (ownerId) targets.delete(ownerId);
    targets.delete(req.user._id.toString());

    for (const recipient of targets) {
      await safeNotify(req, {
        recipient,
        type: NotificationType.QA_REPLY,
        title: 'پاسخ جدیدی برای پرسش دوره شما',
        message: `${req.user.fullName} به پرسش «${discussion.title}» پاسخ داد`,
        link: instructorInboxLink(discussion.course),
        data: { discussionId: discussion._id.toString() },
      });
    }
  }

  return ApiResponse.created(res, mapDiscussion(discussion.toObject() as any), 'پاسخ ثبت شد');
});

/**
 * POST /api/v1/discussions/:id/vote
 * رأی مثبت/منفی به پرسش یا یکی از پاسخ‌ها
 */
export const voteDiscussion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { id } = req.params;
  const { value, replyId } = req.body;

  if (value !== 1 && value !== -1) {
    throw ApiError.badRequest('مقدار رأی نامعتبر است');
  }

  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('پرسش یافت نشد');

  const userId = req.user._id;
  const uid = userId.toString();

  // پیدا کردن پاسخ هدف: ابتدا با _id و در صورت ناموفق بودن با ایندکس
  let target: any = discussion;
  if (replyId) {
    const replies = discussion.replies as any as any[];
    const byId = replies.findIndex((r) => r?._id?.toString() === String(replyId));
    let idx = byId;
    if (idx === -1) {
      const asNumber = parseInt(String(replyId), 10);
      idx = Number.isNaN(asNumber) ? -1 : asNumber;
    }
    if (idx < 0 || idx >= replies.length) throw ApiError.notFound('پاسخ یافت نشد');
    target = replies[idx];
  }

  const upArr: mongoose.Types.ObjectId[] = (target['upvotes'] || []) as any;
  const downArr: mongoose.Types.ObjectId[] = (target['downvotes'] || []) as any;

  const hasUp = upArr.some((u) => u.toString() === uid);

  if (hasUp) {
    // کلیک مجدد روی همان دکمه → لغو رأی
    target['upvotes'] = upArr.filter((u) => u.toString() !== uid);
  } else {
    // ثبت رأی جدید و حذف رأی مخالف قبلی
    target['downvotes'] = downArr.filter((u) => u.toString() !== uid);
    target['upvotes'] = [...upArr.filter((u) => u.toString() !== uid), userId];
  }

  await discussion.save();
  await discussion.populate('user', 'fullName avatar role');
  await discussion.populate('replies.user', 'fullName avatar role');

  return ApiResponse.success(res, mapDiscussion(discussion.toObject() as any), 'رأی شما ثبت شد');
});

/**
 * DELETE /api/v1/discussions/:id
 * حذف پرسش (صاحب پرسش، مدرس دوره یا ادمین)
 */
export const deleteDiscussion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { id } = req.params;
  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('پرسش یافت نشد');

  const course = await Course.findById(discussion.course).select('instructor coInstructors');
  const isOwnerOfQuestion = discussion.user?.toString() === req.user._id.toString();
  const isCourseInstructor = isCourseOwner(req, course);

  if (!isOwnerOfQuestion && !isCourseInstructor) {
    throw ApiError.forbidden('شما اجازه حذف این پرسش را ندارید');
  }

  await discussion.deleteOne();
  return ApiResponse.success(res, { _id: id }, 'پرسش حذف شد');
});

/**
 * POST /api/v1/discussions/:id/share
 * اشتراک‌گذاری پرسش با کاربران
 */
export const shareDiscussion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { id } = req.params;
  const { userIds } = req.body;

  const discussion = await Discussion.findById(id).select('title course');
  if (!discussion) throw ApiError.notFound('پرسش یافت نشد');

  const targets: string[] = Array.isArray(userIds) ? userIds : [];
  if (targets.length === 0) throw ApiError.badRequest('حداقل یک کاربر انتخاب کنید');

  const users = await User.find({ _id: { $in: targets } }).select('_id fullName');
  if (users.length === 0) throw ApiError.notFound('کاربری یافت نشد');

  let shared = 0;
  for (const u of users) {
    if (u._id.toString() === req.user._id.toString()) continue;
    await safeNotify(req, {
      recipient: u._id.toString(),
      title: 'پرسشی با شما به اشتراک گذاشته شد',
      message: `${req.user.fullName}: ${discussion.title}`,
      link: `/learn/${discussion.course}`,
    });
    shared++;
  }

  return ApiResponse.success(res, { shared }, 'پرسش به اشتراک گذاشته شد');
});

// ═══════════════════════════════════════════════════════════
//  پنل مدیریت پرسش و پاسخ (مدرس / ادمین)
// ═══════════════════════════════════════════════════════════

/** شناسه دوره‌هایی که کاربر مالک آن‌هاست (مدرس اصلی یا همکار) */
const getOwnedCourseIds = async (req: Request): Promise<mongoose.Types.ObjectId[]> => {
  const uid = req.user!._id;
  const courses = await Course.find({
    $or: [{ instructor: uid }, { coInstructors: uid }],
  })
    .select('_id')
    .lean();

  return courses.map((c: any) => c._id as mongoose.Types.ObjectId);
};

/**
 * GET /api/v1/discussions/instructor/questions
 * صندوق پرسش‌های مدرس — فقط پرسش‌های دوره‌هایی که خودش مدرس آن‌هاست
 * Query: courseId=&status=unanswered|answered|all&q=&page=&limit=
 */
export const getInstructorQuestions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
    throw ApiError.forbidden('فقط مدرس و مدیر به این بخش دسترسی دارند');
  }

  const { courseId, status, q, page, limit } = req.query as Record<string, string>;

  // ادمین به همه دوره‌ها دسترسی دارد، مدرس فقط دوره‌های خودش
  const ownedIds = req.user.role === 'admin' ? null : await getOwnedCourseIds(req);
  if (ownedIds && ownedIds.length === 0) {
    return ApiResponse.paginated(res, [], 1, 20, 0, 'پرسشی برای شما وجود ندارد');
  }

  const filter: any = { type: 'question' };
  if (ownedIds) filter.course = { $in: ownedIds };
  if (courseId && courseId !== 'all') filter.course = courseId;

  if (status === 'unanswered') {
    filter.$expr = { $eq: [{ $size: { $ifNull: ['$replies', []] } }, 0] };
  } else if (status === 'answered') {
    filter.$expr = { $gt: [{ $size: { $ifNull: ['$replies', []] } }, 0] };
  }

  if (q && q.trim()) {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: rx }, { content: rx }];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    Discussion.find(filter)
      .populate('user', 'fullName avatar role')
      .populate('replies.user', 'fullName avatar role')
      .populate('course', 'title slug thumbnail')
      .populate('lecture', 'title order')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    Discussion.countDocuments(filter),
  ]);

  const userId = req.user._id.toString();
  const enriched = items.map((raw: any) => {
    const d = mapDiscussion(raw);
    const course = raw.course && typeof raw.course === 'object' ? raw.course : null;
    const lecture = raw.lecture && typeof raw.lecture === 'object' ? raw.lecture : null;

    return {
      ...d,
      courseId: course?._id?.toString?.() ?? raw.course?.toString?.() ?? null,
      courseTitle: course?.title ?? null,
      courseSlug: course?.slug ?? null,
      lectureTitle: lecture?.title ?? null,
      replyCount: (raw.replies || []).length,
      hasInstructorReply: (raw.replies || []).some((r: any) => r?.isInstructorReply),
      hasUpvoted: (raw.upvotes || []).some((u: any) => u.toString() === userId),
      hasDownvoted: (raw.downvotes || []).some((u: any) => u.toString() === userId),
      replies: (d.replies || []).map((r: any, idx: number) => ({
        ...r,
        hasUpvoted: ((raw.replies?.[idx]?.upvotes || []) as any[]).some(
          (u: any) => u.toString() === userId,
        ),
        hasDownvoted: ((raw.replies?.[idx]?.downvotes || []) as any[]).some(
          (u: any) => u.toString() === userId,
        ),
      })),
    };
  });

  return ApiResponse.paginated(res, enriched, pageNum, limitNum, total, 'پرسش‌ها دریافت شد');
});

/**
 * GET /api/v1/discussions/instructor/courses
 * لیست دوره‌های مدرس برای فیلتر کردن صندوق پرسش
 */
export const getInstructorQuestionCourses = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
    throw ApiError.forbidden('فقط مدرس و مدیر به این بخش دسترسی دارند');
  }

  const uid = req.user._id;
  const filter =
    req.user.role === 'admin' ? {} : { $or: [{ instructor: uid }, { coInstructors: uid }] };

  const courses = await Course.find(filter)
    .select('title slug thumbnail status')
    .sort({ updatedAt: -1 })
    .lean();

  return ApiResponse.success(res, courses, 'دوره‌ها دریافت شد');
});

/**
 * GET /api/v1/discussions/instructor/stats
 * آمار صندوق پرسش (بی‌پاسخ / پاسخ‌داده / کل)
 */
export const getInstructorQuestionStats = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
    throw ApiError.forbidden('فقط مدرس و مدیر به این بخش دسترسی دارند');
  }

  const ownedIds = req.user.role === 'admin' ? null : await getOwnedCourseIds(req);
  const base: any = { type: 'question' };
  if (ownedIds) base.course = { $in: ownedIds };

  const [total, unanswered] = await Promise.all([
    Discussion.countDocuments(base),
    Discussion.countDocuments({
      ...base,
      $expr: { $eq: [{ $size: { $ifNull: ['$replies', []] } }, 0] },
    }),
  ]);

  return ApiResponse.success(
    res,
    { total, unanswered, answered: total - unanswered },
    'آمار دریافت شد',
  );
});

/**
 * PATCH /api/v1/discussions/:id/moderate
 * مدیریت پرسش توسط مدرس دوره: pin / resolve
 */
export const moderateDiscussion = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { id } = req.params;
  const { isPinned, isResolved } = req.body;

  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('پرسش یافت نشد');

  const course = await Course.findById(discussion.course).select('instructor coInstructors');
  if (!isCourseOwner(req, course)) {
    throw ApiError.forbidden('فقط مدرس این دوره می‌تواند پرسش را مدیریت کند');
  }

  if (isPinned !== undefined) discussion.isPinned = Boolean(isPinned);
  if (isResolved !== undefined) discussion.isResolved = Boolean(isResolved);

  await discussion.save();
  await discussion.populate('user', 'fullName avatar role');
  await discussion.populate('replies.user', 'fullName avatar role');

  return ApiResponse.success(res, mapDiscussion(discussion.toObject() as any), 'به‌روزرسانی شد');
});
