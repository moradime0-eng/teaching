// backend/src/services/learningPathProgress.service.ts

import { Types } from 'mongoose';
import LearningPath from '../models/LearningPath';
import LearningPathEnrollment from '../models/LearningPathEnrollment';
import Certificate from '../models/Certificate';
import User from '../models/User';
import { generateCertificateNumber, generateCertificateHash } from '../utils/certificateGenerator';

/**
 * سرویس مدیریت پیشرفت مسیرهای یادگیری
 * ✅ FIX #3: پیاده‌سازی کامل سیستم پیشرفت
 * ✅ FIX #1: صدور خودکار گواهینامه هنگام تکمیل (۱۰۰٪) مسیر دارای گواهی
 */
export class LearningPathProgressService {
  /**
   * وقتی یک دوره تکمیل می‌شود، این متد را صدا بزنید.
   * تمام مسیرهایی که این دوره در آن‌هست را به‌روز می‌کند.
   *
   * ⚠️ FIX CRITICAL: پارامتر `pathId` اضافه شد. پیش از این، متد همه‌ی ثبت‌نام‌های
   * کاربر را تغییر می‌داد حتی وقتی لایه‌ی HTTP فقط یک مسیر مشخص را هدف گرفته بود.
   * اگر pathId داده نشود، رفتار قبلی (به‌روزرسانی همه‌ی مسیرها) حفظ می‌شود.
   */
  static async onCourseCompleted(
    userId: string | Types.ObjectId,
    courseId: string | Types.ObjectId,
    pathId?: string | Types.ObjectId,
  ): Promise<void> {
    try {
      const userIdStr = userId.toString();
      const courseIdStr = courseId.toString();

      const query: any = {
        user: userIdStr,
        status: { $in: ['active', 'paused'] },
      };
      // 🎯 فقط مسیرِ مشخص‌شده به‌روزرسانی شود (در صورت ارائه)
      if (pathId) query.learningPath = pathId.toString();

      const enrollments = await LearningPathEnrollment.find(query);

      for (const enrollment of enrollments) {
        const path = await LearningPath.findById(enrollment.learningPath);
        if (!path || !Array.isArray(path.stages)) continue;

        // بررسی وجود دوره در مسیر
        const allCourseNodes = path.stages.flatMap((s: any) => s.courses || []);
        const nodeExists = allCourseNodes.some((cn: any) => cn.course?.toString() === courseIdStr);
        if (!nodeExists) continue;

        // اگر قبلاً ثبت نشده، اضافه کن
        const alreadyCompleted = enrollment.completedCourses.some(
          (c: any) => c.course?.toString() === courseIdStr,
        );
        if (!alreadyCompleted) {
          enrollment.completedCourses.push({
            course: new Types.ObjectId(courseIdStr),
            completedAt: new Date(),
          } as any);
        }

        // محاسبه پیشرفت بر اساس دوره‌های اجباری
        const requiredNodes = allCourseNodes.filter((cn: any) => cn.isRequired);
        const completedRequired = enrollment.completedCourses.filter((c: any) =>
          requiredNodes.some((rn: any) => rn.course?.toString() === c.course?.toString()),
        );

        enrollment.progress =
          requiredNodes.length > 0
            ? Math.round((completedRequired.length / requiredNodes.length) * 100)
            : 100;

        // به‌روزرسانی currentStageIndex
        enrollment.currentStageIndex = LearningPathProgressService.calculateCurrentStage(
          path,
          enrollment.completedCourses,
        );

        enrollment.lastAccessedAt = new Date();

        // اگر ۱۰۰٪ شد
        if (enrollment.progress >= 100 && enrollment.status !== 'completed') {
          enrollment.status = 'completed';
          enrollment.completedAt = new Date();
        }

        await enrollment.save();

        // ✅ FIX #1: صدور خودکار گواهینامه در صورت تکمیل مسیرِ دارای گواهی
        await LearningPathProgressService.issueCertificateIfEligible(enrollment._id, path);
      }
    } catch (err: any) {
      console.error('❌ [LearningPathProgressService] onCourseCompleted:', err.message);
    }
  }

  /**
   * ✅ FIX #1: اگر ثبت‌نام تکمیل شده باشد و مسیر `hasCertificate: true` داشته باشد،
   * یک سند Certificate می‌سازد و enrollment.certificateIssued / certificate را
   * به‌روز می‌کند.
   *
   * کاملاً idempotent است: اگر قبلاً صادر شده باشد، کاری نمی‌کند.
   */
  static async issueCertificateIfEligible(
    enrollmentId: string | Types.ObjectId,
    pathOverride?: any,
  ): Promise<any | null> {
    try {
      const enrollment = await LearningPathEnrollment.findById(enrollmentId);
      if (!enrollment) return null;
      if (enrollment.certificateIssued && enrollment.certificate) return null;
      if (enrollment.status !== 'completed' || (enrollment.progress ?? 0) < 100) return null;

      const path = pathOverride || (await LearningPath.findById(enrollment.learningPath));
      if (!path || !path.hasCertificate) return null;

      const completedAt = enrollment.completedAt || new Date();

      const certificateNumber = generateCertificateNumber();
      const verificationHash = generateCertificateHash(
        enrollment.user.toString(),
        path._id.toString(),
        completedAt,
      );

      const student = await User.findById(enrollment.user).select('fullName');

      const certData: any = {
        user: enrollment.user,
        learningPath: path._id,
        learningPathEnrollment: enrollment._id,
        type: 'learning-path',
        certificateNumber,
        verificationHash,
        studentName: student?.fullName || 'دانشجو',
        courseName: path.certificateTitle || path.title,
        instructorName: 'پلتفرم همایون',
        completedAt,
        issuedAt: new Date(),
        totalHours: Math.max(1, Math.round((path.estimatedTotalDuration || 0) / 3600)),
        isRevoked: false,
      };

      if (process.env.MULTI_TENANT_ENABLED === 'true' && enrollment.tenant) {
        certData.tenant = enrollment.tenant;
      }

      const certificate = await Certificate.create(certData);

      enrollment.certificateIssued = true;
      enrollment.certificate = certificate._id;
      await enrollment.save();

      return certificate;
    } catch (err: any) {
      // 11000 = duplicate key → قبلاً صادر شده است
      if (err?.code !== 11000) {
        console.error('❌ [LearningPathProgressService] issueCertificate:', err.message);
      }
      return null;
    }
  }

  /**
   * محاسبه اندیس مرحله فعلی بر اساس دوره‌های تکمیل‌شده
   */
  private static calculateCurrentStage(path: any, completedCourses: any[]): number {
    const completedIds = new Set(completedCourses.map((c: any) => c.course?.toString()));
    for (let i = 0; i < path.stages.length; i++) {
      const stage = path.stages[i];
      const requiredInStage = (stage.courses || []).filter((cn: any) => cn.isRequired);
      if (requiredInStage.length === 0) continue;
      const allCompleted = requiredInStage.every((cn: any) =>
        completedIds.has(cn.course?.toString()),
      );
      if (!allCompleted) return i;
    }
    return Math.max(0, path.stages.length - 1);
  }

  /**
   * محاسبه مجدد پیشرفت یک enrollment خاص (برای همگام‌سازی دستی)
   */
  static async recalculateProgress(enrollmentId: string | Types.ObjectId): Promise<void> {
    const enrollment = await LearningPathEnrollment.findById(enrollmentId);
    if (!enrollment) return;
    const path = await LearningPath.findById(enrollment.learningPath);
    if (!path) return;

    const allCourseNodes = path.stages.flatMap((s: any) => s.courses || []);
    const requiredNodes = allCourseNodes.filter((cn: any) => cn.isRequired);
    const completedRequired = enrollment.completedCourses.filter((c: any) =>
      requiredNodes.some((rn: any) => rn.course?.toString() === c.course?.toString()),
    );

    enrollment.progress =
      requiredNodes.length > 0
        ? Math.round((completedRequired.length / requiredNodes.length) * 100)
        : 100;

    enrollment.currentStageIndex = LearningPathProgressService.calculateCurrentStage(
      path,
      enrollment.completedCourses,
    );

    if (enrollment.progress >= 100 && enrollment.status !== 'completed') {
      enrollment.status = 'completed';
      enrollment.completedAt = enrollment.completedAt || new Date();
    }

    enrollment.lastAccessedAt = new Date();
    await enrollment.save();

    // ✅ FIX #1: پس از هر بازمحاسبه، وضعیت گواهینامه نیز بررسی می‌شود
    await LearningPathProgressService.issueCertificateIfEligible(enrollment._id, path);
  }
}
