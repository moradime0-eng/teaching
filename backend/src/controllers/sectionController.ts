/**
 * 📚 Section Controller — CRUD operations for course sections
 *
 * Sections are now a separate collection (not embedded in Course).
 * Each section belongs to a course and a tenant.
 */

import { Request, Response } from 'express';
import Section from '../models/Section';
import Lecture from '../models/Lecture';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { safeDeleteSectionS3Files } from '../services/safeFileDeletionService';

/**
 * Recalculate course stats (totalSections, totalLectures, totalDuration)
 * from the Section and Lecture collections.
 */
export const recalculateCourseStats = async (courseId: string): Promise<void> => {
  const sections = await Section.find({ course: courseId }).sort({ order: 1 }).lean();
  const totalSections = sections.length;

  let totalLectures = 0;
  let totalDuration = 0;

  if (totalSections > 0) {
    const sectionIds = sections.map((s) => s._id);
    const lectures = await Lecture.find({ section: { $in: sectionIds } }).lean();
    totalLectures = lectures.length;
    totalDuration = lectures.reduce((sum, l) => sum + (l.duration || 0), 0);
  }

  await Course.findByIdAndUpdate(courseId, {
    totalSections,
    totalLectures,
    totalDuration,
    lastUpdatedContent: new Date(),
  });
};

/**
 * Recalculate section stats (totalLectures, totalDuration) for a single section.
 */
const recalculateSectionStats = async (sectionId: string): Promise<void> => {
  const lectures = await Lecture.find({ section: sectionId }).lean();
  const totalLectures = lectures.length;
  const totalDuration = lectures.reduce((sum, l) => sum + (l.duration || 0), 0);
  await Section.findByIdAndUpdate(sectionId, { totalLectures, totalDuration });
};

/**
 * Verify that the current user owns this course (or is admin).
 */
const verifyCourseOwnership = async (courseId: string, userId: string, userRole: string) => {
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('دوره یافت نشد');
  if (course.instructor.toString() !== userId && userRole !== 'admin') {
    throw ApiError.forbidden('شما اجازه ویرایش این دوره را ندارید');
  }
  return course;
};

// ==================== CREATE SECTION ====================
export const createSection = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId } = req.params;
  const { title, description } = req.body;

  // [MULTI-TENANT-DISABLED] const tenantId = req.tenantId || (req.tenant as any)?._id;
  // [MULTI-TENANT-DISABLED] if (!tenantId) throw ApiError.badRequest('شناسه آموزشگاه یافت نشد.');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  // Determine order: append at end
  const lastSection = await Section.findOne({ course: courseId }).sort({ order: -1 }).lean();
  const order = lastSection ? lastSection.order + 1 : 0;

  const section = await Section.create({
    course: courseId,
    title: title?.trim() || 'فصل جدید',
    description: description || '',
    order,
    // [MULTI-TENANT-DISABLED] tenant: tenantId,
  });

  await recalculateCourseStats(courseId);
  return ApiResponse.created(res, section, 'فصل با موفقیت ایجاد شد');
});

// ==================== LIST SECTIONS ====================
export const listSections = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  const sections = await Section.find({ course: courseId }).sort({ order: 1 }).lean();
  return ApiResponse.success(res, sections);
});

// ==================== UPDATE SECTION ====================
export const updateSection = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId } = req.params;

  const section = await Section.findOne({ _id: sectionId, course: courseId });
  if (!section) throw ApiError.notFound('فصل یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const { title, description, order } = req.body;
  if (title !== undefined) section.title = title.trim();
  if (description !== undefined) section.description = description;
  if (order !== undefined) section.order = order;

  await section.save();
  return ApiResponse.success(res, section, 'فصل با موفقیت بروزرسانی شد');
});

// ==================== DELETE SECTION ====================
export const deleteSection = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId, sectionId } = req.params;

  const section = await Section.findOne({ _id: sectionId, course: courseId });
  if (!section) throw ApiError.notFound('فصل یافت نشد');

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  // ابتدا کلیدهای S3 استخراج و ثبت شوند (قبل از حذف رکورد)
  const { deleted, failed } = await safeDeleteSectionS3Files(sectionId);

  // سپس عملیات دیتابیس انجام شود
  await Lecture.deleteMany({ section: sectionId });
  await Section.findByIdAndDelete(sectionId);
  await recalculateCourseStats(courseId);

  if (failed.length > 0) {
    console.warn(`⚠️ Some S3 files could not be deleted for section ${sectionId}:`, failed);
  }

  return ApiResponse.success(res, null, 'فصل با موفقیت حذف شد');
});

// ==================== REORDER SECTIONS ====================
export const reorderSections = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { courseId } = req.params;
  const { sectionIds } = req.body;

  if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
    throw ApiError.badRequest('لیست ترتیب فصل‌ها الزامی است');
  }

  await verifyCourseOwnership(courseId, req.user._id.toString(), req.user.role);

  const bulkOps = sectionIds.map((id: string, index: number) => ({
    updateOne: {
      filter: { _id: id, course: courseId },
      update: { $set: { order: index } },
    },
  }));

  await Section.bulkWrite(bulkOps);

  const sections = await Section.find({ course: courseId }).sort({ order: 1 }).lean();
  return ApiResponse.success(res, sections, 'ترتیب فصل‌ها با موفقیت بروزرسانی شد');
});
