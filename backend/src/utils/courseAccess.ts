import { Request } from 'express';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import { ApiError } from './ApiError';

/** Resolve visibility once per request; never treat a refunded or expired enrollment as access. */
export async function courseAccess(req: Request, courseId: any) {
  const course = await Course.findById(courseId).select('status isFree instructor coInstructors');
  if (!course) throw ApiError.notFound('دوره یافت نشد');
  const userId = req.user?._id?.toString();
  const manager = !!userId && (req.user?.role === 'admin' ||
    course.instructor?.toString() === userId ||
    (course.coInstructors || []).some((id: any) => (id?._id || id).toString() === userId));
  if (!manager && course.status !== 'published') throw ApiError.notFound('دوره یافت نشد');
  let enrolled = false;
  if (!manager && userId) {
    enrolled = !!(await Enrollment.findOne({ student: req.user!._id, course: courseId,
      isRefunded: false, $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).select('_id'));
  }
  return { manager, canViewContent: manager || !!course.isFree || enrolled };
}

export function visibleLecture(lecture: any, access: { manager: boolean; canViewContent: boolean }) {
  if (!access.manager && lecture.isPublished === false) return null;
  if (access.canViewContent || lecture.isFreePreview) return lecture;
  const { _id, title, type, duration, isFreePreview, order, isPublished, section } = lecture;
  return { _id, title, type, duration, isFreePreview, order, isPublished, section };
}
