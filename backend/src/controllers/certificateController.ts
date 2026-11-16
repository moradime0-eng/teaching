// backend/src/controllers/certificateController.ts

import { Request, Response } from 'express';
import Certificate from '../models/Certificate';
import Enrollment from '../models/Enrollment';
import User from '../models/User';
import LearningPathEnrollment from '../models/LearningPathEnrollment';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import {
  generateCertificateNumber,
  generateCertificateHash,
} from '../utils/certificateGenerator';

// ════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════
type CertificateType = 'course' | 'learning-path';

/**
 * ✅ FIX: نگاشت یک سند Certificate به فرمت قابل نمایش.
 *
 * گواهینامه‌ها دو نوع دارند:
 *  - `course`        → برای یک دورهٔ تکمیل‌شده
 *  - `learning-path` → برای یک مسیر یادگیری تکمیل‌شده (course/enrollment خالی است)
 *
 * پیش از این فقط `course` populate می‌شد، بنابراین عنوان گواهینامه‌های
 * مسیر یادگیری خالی نمایش داده می‌شد.
 */
function serializeCertificate(cert: any): Record<string, unknown> {
  const isLearningPath =
    cert?.type === 'learning-path' || (!cert?.course && !!cert?.learningPath);

  const lp = cert?.learningPath;
  const course = cert?.course;

  const title = isLearningPath
    ? lp?.certificateTitle || lp?.title || cert?.courseName || 'مسیر یادگیری'
    : course?.title || cert?.courseName || 'دوره آموزشی';

  return {
    _id: cert._id,
    type: isLearningPath ? 'learning-path' : 'course',

    // عنوان نمایشی — همیشه مقدار دارد
    title,
    subtitle: isLearningPath ? (lp?.subtitle ?? null) : (course?.subtitle ?? null),

    // دوره (فقط برای گواهینامه دوره)
    course: isLearningPath
      ? null
      : {
          _id: course?._id ?? cert.course ?? null,
          title: course?.title ?? cert?.courseName ?? '',
          slug: course?.slug ?? null,
          thumbnail: course?.thumbnail ?? null,
        },

    // مسیر یادگیری (فقط برای گواهینامه مسیر)
    learningPath: isLearningPath
      ? {
          _id: lp?._id ?? cert.learningPath ?? null,
          title: lp?.title ?? cert?.courseName ?? '',
          slug: lp?.slug ?? null,
          icon: lp?.icon ?? null,
          certificateTitle: lp?.certificateTitle ?? null,
          stagesCount: Array.isArray(lp?.stages) ? lp.stages.length : 0,
        }
      : null,

    // پیشرفت (فقط گواهینامه مسیر)
    learningPathEnrollment: isLearningPath
      ? {
          _id: cert.learningPathEnrollment?._id ?? cert.learningPathEnrollment ?? null,
          progress: cert.learningPathEnrollment?.progress ?? 100,
          completedAt:
            cert.learningPathEnrollment?.completedAt ?? cert.completedAt ?? null,
        }
      : null,

    certificateNumber: cert.certificateNumber,
    studentName: cert.studentName,
    instructorName: cert.instructorName,
    completedAt: cert.completedAt,
    issuedAt: cert.issuedAt,
    totalHours: cert.totalHours,
    pdfUrl: cert.pdfUrl ?? null,
    isRevoked: cert.isRevoked,
  };
}

/** نوع + لینک عمومی برای «مشاهده» گواهینامه در فرانت */
function publicTarget(cert: any): { kind: CertificateType; url: string | null } {
  const isLearningPath =
    cert?.type === 'learning-path' || (!cert?.course && !!cert?.learningPath);

  return {
    kind: isLearningPath ? 'learning-path' : 'course',
    url: isLearningPath
      ? cert?.learningPath?.slug
        ? `/learning-paths/${cert.learningPath.slug}`
        : null
      : cert?.course?.slug
        ? `/courses/${cert.course.slug}`
        : null,
  };
}

// ════════════════════════════════════════════════════════════════
// POST /api/v1/certificates/issue — فقط ادمین، فقط برای دوره
// ════════════════════════════════════════════════════════════════
export const issueCertificate = asyncHandler(async (req: Request, res: Response) => {
  const { enrollmentId } = req.body;

  if (!enrollmentId) throw ApiError.badRequest('شناسه ثبت‌نام الزامی است');

  const enrollment = await Enrollment.findById(enrollmentId)
    .populate({
      path: 'course',
      populate: { path: 'instructor', select: 'fullName' },
    })
    .populate('student');

  if (!enrollment) throw ApiError.notFound('ثبت‌نام یافت نشد');
  if (!enrollment.isCompleted) {
    throw ApiError.badRequest('دانشجو هنوز دوره را تکمیل نکرده است');
  }
  if (enrollment.certificateIssued) {
    throw ApiError.conflict('گواهینامه قبلاً صادر شده است');
  }

  const course = enrollment.course as any;
  const student = enrollment.student as any;

  if (!course || !student) {
    throw ApiError.badRequest('اطلاعات دوره یا دانشجو در دسترس نیست');
  }

  const certificateNumber = generateCertificateNumber();
  const verificationHash = generateCertificateHash(
    student._id.toString(),
    course._id.toString(),
    new Date(),
  );

  const certData: Record<string, unknown> = {
    user: student._id,
    course: course._id,
    enrollment: enrollment._id,
    type: 'course',
    certificateNumber,
    verificationHash,
    studentName: student.fullName,
    courseName: course.title,
    instructorName: course.instructor?.fullName || 'مدرس دوره',
    completedAt: enrollment.completedAt,
    totalHours: Math.round(course.totalDuration / 3600) || 1,
    isRevoked: false,
  };

  // ✅ multi-tenancy: فیلد tenant در مدل Certificate اجباری است
  const tenantId =
    (req as any).tenant?._id ??
    student.tenant ??
    course.tenant ??
    null;

  if (tenantId) certData['tenant'] = tenantId;

  const certificate = await Certificate.create(certData);

  enrollment.certificateIssued = true;
  enrollment.certificate = certificate._id;
  await enrollment.save();

  return ApiResponse.created(
    res,
    serializeCertificate(certificate),
    'گواهینامه با موفقیت صادر شد',
  );
});

// ════════════════════════════════════════════════════════════════
// POST /api/v1/certificates/issue-learning-path — صدور دستی گواهی مسیر
// (صدور خودکار در LearningPathProgressService انجام می‌شود؛ این
//  endpoint برای صدور دستی توسط ادمین است)
// ════════════════════════════════════════════════════════════════
export const issueLearningPathCertificate = asyncHandler(
  async (req: Request, res: Response) => {
    const { enrollmentId } = req.body;

    if (!enrollmentId) throw ApiError.badRequest('شناسه ثبت‌نام مسیر الزامی است');

    const enrollment = await LearningPathEnrollment.findById(enrollmentId)
      .populate('user', 'fullName')
      .populate(
        'learningPath',
        'title slug icon hasCertificate certificateTitle estimatedTotalDuration',
      );

    if (!enrollment) throw ApiError.notFound('ثبت‌نام در مسیر یادگیری یافت نشد');

    if (enrollment.status !== 'completed' || (enrollment.progress ?? 0) < 100) {
      throw ApiError.badRequest('دانشجو هنوز مسیر یادگیری را تکمیل نکرده است');
    }
    if (enrollment.certificateIssued && enrollment.certificate) {
      throw ApiError.conflict('گواهینامه قبلاً صادر شده است');
    }

    const lp = enrollment.learningPath as any;
    if (!lp?.hasCertificate) {
      throw ApiError.badRequest('برای این مسیر یادگیری گواهینامه تعریف نشده است');
    }

    const certificateNumber = generateCertificateNumber();
    const verificationHash = generateCertificateHash(
      enrollment.user.toString(),
      lp._id.toString(),
      enrollment.completedAt || new Date(),
    );

    const certData: Record<string, unknown> = {
      user: enrollment.user,
      learningPath: lp._id,
      learningPathEnrollment: enrollment._id,
      type: 'learning-path',
      certificateNumber,
      verificationHash,
      studentName: (enrollment.user as any)?.fullName || 'دانشجو',
      courseName: lp.certificateTitle || lp.title,
      instructorName: 'پلتفرم همایون',
      completedAt: enrollment.completedAt || new Date(),
      totalHours: Math.max(1, Math.round((lp.estimatedTotalDuration || 0) / 3600)),
      isRevoked: false,
    };

    if (enrollment.tenant) certData['tenant'] = enrollment.tenant;

    const certificate = await Certificate.create(certData);

    enrollment.certificateIssued = true;
    enrollment.certificate = certificate._id;
    await enrollment.save();

    return ApiResponse.created(
      res,
      serializeCertificate(certificate),
      'گواهینامه مسیر یادگیری صادر شد',
    );
  },
);

// ════════════════════════════════════════════════════════════════
// GET /api/v1/certificates — گواهینامه‌های کاربر (دوره + مسیر یادگیری)
// ════════════════════════════════════════════════════════════════
export const getMyCertificates = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  // ✅ FIX: هر دو نوع گواهینامه populate می‌شوند
  const certificates = await Certificate.find({
    user: req.user._id,
    isRevoked: false,
  })
    .populate('course', 'title slug thumbnail')
    .populate('learningPath', 'title slug icon certificateTitle stages.title')
    .populate('learningPathEnrollment', 'progress completedAt')
    .sort({ issuedAt: -1 })
    .lean();

  const data = certificates.map((cert: any) => {
    const item = serializeCertificate(cert);
    const target = publicTarget(cert);
    return { ...item, kind: target.kind, url: target.url };
  });

  return ApiResponse.success(res, data);
});

// ════════════════════════════════════════════════════════════════
// GET /api/v1/certificates/:id — یک گواهینامه (برای view/download)
// ════════════════════════════════════════════════════════════════
export const getCertificateById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const isAdmin = (req as any).user?.role === 'admin';

  const query: Record<string, unknown> = { _id: id };
  // کاربر فقط گواهینامهٔ خودش را می‌بیند
  if (!isAdmin && req.user?._id) query['user'] = req.user._id;

  const certificate = await Certificate.findOne(query)
    .populate('course', 'title slug thumbnail')
    .populate('learningPath', 'title slug icon certificateTitle stages.title')
    .populate('learningPathEnrollment', 'progress completedAt')
    .lean();

  if (!certificate) throw ApiError.notFound('گواهینامه یافت نشد');

  const item = serializeCertificate(certificate);
  const target = publicTarget(certificate);

  return ApiResponse.success(res, {
    ...item,
    kind: target.kind,
    url: target.url,
    // ✅ لینک دانلود — اگر PDF تولید شده باشد
    downloadUrl: certificate.pdfUrl ? `/api/v1/certificates/${certificate._id}/download` : null,
  });
});

// ════════════════════════════════════════════════════════════════
// GET /api/v1/certificates/:id/download — دانلود / چاپ گواهینامه
// ════════════════════════════════════════════════════════════════
export const downloadCertificate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const isAdmin = (req as any).user?.role === 'admin';

  const query: Record<string, unknown> = { _id: id };
  if (!isAdmin && req.user?._id) query['user'] = req.user._id;

  const certificate = await Certificate.findOne(query).lean();
  if (!certificate) throw ApiError.notFound('گواهینامه یافت نشد');

  if (certificate.isRevoked) {
    throw ApiError.badRequest('این گواهینامه لغو شده است');
  }

  // ✅ اگر فایل PDF تولید و ذخیره شده باشد، ارسال می‌شود
  if (certificate.pdfUrl) {
    if (/^https?:\/\//i.test(certificate.pdfUrl)) {
      return res.redirect(certificate.pdfUrl);
    }
    return res.sendFile(certificate.pdfUrl);
  }

  // در غیر این صورت، HTML قابل چاپ به‌عنوان PDF ارائه می‌شود.
  const html = buildPrintableCertificateHtml({
    certificateNumber: certificate.certificateNumber,
    title: certificate.courseName,
    studentName: certificate.studentName,
    instructorName: certificate.instructorName,
    completedAt: certificate.completedAt,
    totalHours: certificate.totalHours,
    isLearningPath: certificate.type === 'learning-path' || !certificate.course,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="certificate-${certificate.certificateNumber}.html"`,
  );
  return res.send(html);
});

/** HTML ساده و قابل چاپ (جایگزین موقت PDF در نبود سرویس تولید PDF) */
function buildPrintableCertificateHtml(data: {
  certificateNumber: string;
  title: string;
  studentName: string;
  instructorName: string;
  completedAt: Date | string;
  totalHours: number;
  isLearningPath: boolean;
}): string {
  const date = new Date(data.completedAt).toLocaleDateString('fa-IR');
  const kindLabel = data.isLearningPath
    ? 'گواهینامه پایان مسیر یادگیری'
    : 'گواهینامه دوره آموزشی';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${data.certificateNumber}</title>
<style>
  body{margin:0;padding:32px;background:#f6f2ea;font-family:Tahoma,'Vazirmatn',sans-serif;color:#1b1710}
  .sheet{max-width:760px;margin:0 auto;background:#fffdf9;border:2px solid #e4532f;border-radius:16px;padding:56px 48px;text-align:center}
  h1{margin:0 0 8px;font-size:22px;color:#e4532c}
  h2{margin:0 0 32px;font-size:17px;font-weight:700}
  .label{color:#5e574b;font-size:15px}
  .name{margin:12px 0 28px;font-size:26px;font-weight:800}
  .title{margin:8px 0 32px;font-size:19px;font-weight:700;color:#1b1710}
  .meta{display:flex;justify-content:center;gap:32px;flex-wrap:wrap;color:#5e574b;font-size:13px}
  .num{margin-top:36px;padding-top:20px;border-top:1px solid #e6dfcd;color:#9c9284;font-size:12px;letter-spacing:.08em}
  @media print{body{background:#fff;padding:0}.sheet{border-width:3px}}
</style>
</head>
<body>
  <div class="sheet">
    <h1>${kindLabel}</h1>
    <h2>بسمه‌تعالی</h2>
    <p class="label">بدین‌وسیله گواهی می‌شود که</p>
    <p class="name">${data.studentName}</p>
    <p class="label">با موفقیت دورهٔ زیر را با مجموع</p>
    <p class="name" style="font-size:19px">${data.totalHours} ساعت آموزشی</p>
    <p class="label">به پایان رساند:</p>
    <p class="title">${data.title}</p>
    <div class="meta">
      <span>تاریخ تکمیل: ${date}</span>
      <span>${data.instructorName}</span>
    </div>
    <div class="num">${data.certificateNumber}</div>
  </div>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════════
// GET /api/v1/certificates/verify/:certificateNumber — عمومی
// ════════════════════════════════════════════════════════════════
export const verifyCertificate = asyncHandler(async (req: Request, res: Response) => {
  const { certificateNumber } = req.params;

  const certificate = await Certificate.findOne({
    certificateNumber: String(certificateNumber).toUpperCase(),
    isRevoked: false,
  })
    .populate('user', 'fullName')
    .populate('course', 'title')
    .populate('learningPath', 'title certificateTitle')
    .lean();

  if (!certificate) {
    throw ApiError.notFound('گواهینامه‌ای با این شماره یافت نشد');
  }

  const item = serializeCertificate(certificate);

  return ApiResponse.success(
    res,
    {
      certificateNumber: certificate.certificateNumber,
      type: item['type'],
      studentName: (certificate.user as any)?.fullName ?? item['studentName'],
      // ✅ برای گواهینامه مسیر هم عنوان درست برمی‌گردد
      title: item['title'],
      issuedAt: certificate.issuedAt,
      totalHours: certificate.totalHours,
      isValid: true,
    },
    'گواهینامه معتبر است',
  );
});

// ════════════════════════════════════════════════════════════════
// PUT /api/v1/certificates/:id/revoke — فقط ادمین
// ════════════════════════════════════════════════════════════════
export const revokeCertificate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const certificate = await Certificate.findById(id);
  if (!certificate) throw ApiError.notFound('گواهینامه یافت نشد');

  certificate.isRevoked = true;
  certificate.revokedAt = new Date();
  certificate.revokedReason = reason || 'توسط مدیر لغو شد';
  await certificate.save();

  // ✅ هماهنگ‌سازی با ثبت‌نام مسیر یادگیری (در صورت وجود)
  if (certificate.learningPathEnrollment) {
    await LearningPathEnrollment.updateOne(
      { _id: certificate.learningPathEnrollment },
      { $set: { certificateIssued: false, certificate: null } },
    );
  }

  // ✅ هماهنگ‌سازی با Enrollment دوره (در صورت وجود)
  if (certificate.enrollment) {
    await Enrollment.updateOne(
      { _id: certificate.enrollment },
      { $set: { certificateIssued: false, certificate: null } },
    );
  }

  return ApiResponse.success(res, serializeCertificate(certificate), 'گواهینامه لغو شد');
});