/**
 * 📤 Upload Controller — S3 Presigned URL + Smart Video Stream
 * ✅ مجهز به اندپوینت هوشمند /file/:lectureId جهت نمایش آنلاین PDF/تصاویر و دانلود خودکار ZIP بدون ارور XML
 * ✅ رفع کامل تداخل فیلدهای ویدیو معرفی دوره (Promo Teaser Video)
 * ✅ FIX: proxyUpload حالا contentItemId را پشتیبانی می‌کند و storage.key را در contentItem ذخیره می‌کند
 * ✅ FIX: proxyUpload حالا processing.status را به READY تنظیم می‌کند (رفع پیام "در حال آماده‌سازی")
 * ✅ FIX: serveFile با فال‌بک بهتر و لاگ تشخیصی
 * ✅ FIX: streamLectureVideo با لاگ تشخیصی دقیق + فال‌بک هوشمند
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import storageService from '../services/storageService';
import Lecture from '../models/Lecture';
import Course from '../models/Course';
import Enrollment from '../models/Enrollment';
import { courseAccess } from '../utils/courseAccess';

const requireInstructor = (req: Request): void => {
  if (!req.user) throw ApiError.unauthorized();
  if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
    throw ApiError.forbidden('فقط مدرسین و مدیران می‌توانند فایل آپلود کنند');
  }
};

// ==================== 🔒 توکن کوتاه‌عمر استریم ====================
const signStreamToken = (userId: string, role: string, lectureId: string): string =>
  jwt.sign({ id: userId, role, lec: lectureId }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: '15m',
  });

const tryAuthFromStreamToken = (req: Request): void => {
  if (req.user) return;
  const t = (req.query as Record<string, string | undefined>)?.t;
  if (!t || typeof t !== 'string') return;
  try {
    const decoded = jwt.verify(t, process.env.JWT_ACCESS_SECRET!) as {
      id?: string;
      role?: string;
      lec?: string;
    };
    if (decoded?.id && (!decoded.lec || decoded.lec === req.params.lectureId)) {
      (req as any).user = { _id: decoded.id, role: decoded.role || 'student' };
    }
  } catch {
    // توکن نامعتبر → بدون کاربر ادامه می‌دهیم
  }
};

const sanitizeFolder = (raw: unknown, fallback = 'uploads'): string => {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  let folder = raw.trim().replace(/\\/g, '/');
  folder = folder.replace(/\.\./g, '');
  folder = folder.replace(/[^a-zA-Z0-9/_-]/g, '_');
  folder = folder.replace(/^\/+|\/+$/g, '');
  folder = folder.replace(/\/{2,}/g, '/');
  return folder || fallback;
};

/**
 * ✅ استخراج S3 key از یک فیلد که ممکن است key خام یا URL کامل باشد
 */
const extractS3Key = (value: string | undefined | null): string => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const path = url.pathname.replace(/^\/+/, '');
      const bucket = process.env.S3_BUCKET || 'iranian-udemy-videos';
      if (path.startsWith(`${bucket}/`)) {
        return path.substring(bucket.length + 1);
      }
      return path;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
};

/**
 * ✅ NEW: ساخت object processing با status=READY
 * حفظ hls و thumbnails موجود
 * نکته: مقادیر مجاز status در IProcessingInfo عبارتند از: PENDING | UPLOADING | PROCESSING | READY | FAILED
 */
const buildCompletedProcessing = (existing: any): any => {
  return {
    status: 'READY',
    progress: 100,
    hls: existing?.hls || { qualities: [] },
    thumbnails: existing?.thumbnails || [],
  };
};

const assertCourseOwnership = async (req: Request, courseId: any): Promise<void> => {
  if (!courseId) return;
  const course = await Course.findById(courseId).select('instructor coInstructors');
  if (!course) throw ApiError.notFound('دوره یافت نشد');
  if (req.user!.role === 'admin') return;
  if (course.instructor?.toString() === req.user!._id.toString()) return;
  const isCoInstructor = Array.isArray(course.coInstructors)
    && course.coInstructors.some((c: any) => (typeof c === 'object' ? c?._id || c : c)?.toString() === req.user!._id.toString());
  if (!isCoInstructor) {
    throw ApiError.forbidden('شما مالک این دوره نیستید');
  }
};

const assertContentAccess = async (
  req: Request,
  courseId: any,
  isFreePreview: boolean,
): Promise<void> => {
  if (!courseId) throw ApiError.notFound('دوره یافت نشد');
  const access = await courseAccess(req, courseId);
  if (access.canViewContent || isFreePreview) return;
  if (!req.user) throw ApiError.unauthorized('برای دسترسی به این محتوا ابتدا وارد شوید');
  throw ApiError.forbidden('شما در این دوره ثبت‌نام نکرده‌اید');
};

// ==================== ۱. دریافت Presigned URL ====================
export const getPresignedUrl = asyncHandler(async (req: Request, res: Response) => {
  requireInstructor(req);
  const { fileName, contentType, folder, type } = req.body;
  if (!fileName || !contentType || !folder) throw ApiError.badRequest('اطلاعات ناقص است');

  const safeFolder = sanitizeFolder(folder);
  const safeContentType = /^[a-zA-Z0-9!#$&^_.+-]{1,100}\/[a-zA-Z0-9!#$&^_.+-]{1,100}$/.test(
    String(contentType),
  )
    ? String(contentType)
    : 'application/octet-stream';

  const uploadType = (type as string) || 'resource';
  if (!storageService.validateContentType(safeContentType, uploadType as 'video' | 'resource' | 'audio')) {
    throw ApiError.badRequest('فرمت فایل مجاز نیست');
  }

  const { uploadUrl, key } = await storageService.getPresignedUploadUrl(fileName, safeContentType, safeFolder);
  return ApiResponse.success(res, { uploadUrl, key }, 'Presigned URL ساخته شد');
});

// ==================== ۲. آپلود پروکسی ====================
export const proxyUpload = asyncHandler(async (req: Request, res: Response) => {
  requireInstructor(req);
  if (!req.file) throw ApiError.badRequest('فایلی ارسال نشد');

  const folder = sanitizeFolder((req.body.folder as string) || 'uploads');
  const type = (req.body.type as string) || 'resource';
  const lectureId = req.body.lectureId as string | undefined;
  const contentItemId = req.body.contentItemId as string | undefined;
  const courseId = req.body.courseId as string | undefined;
  const duration = parseInt(req.body.duration as string, 10) || 0;

  if (!storageService.validateContentType(req.file.mimetype, type as 'video' | 'resource' | 'audio')) {
    throw ApiError.badRequest('فرمت فایل مجاز نیست');
  }

  if (!storageService.validateFileSize(req.file.size, type as 'video' | 'resource' | 'audio')) {
    throw ApiError.badRequest('حجم فایل مجاز نیست');
  }

  // 🔒 ضد IDOR: مالکیت دوره مقصد
  let targetCourseId: any = courseId || null;
  if (lectureId) {
    const lectureDoc = await Lecture.findById(lectureId).select('course');
    if (lectureDoc?.course) targetCourseId = lectureDoc.course;
  }
  if (targetCourseId) await assertCourseOwnership(req, targetCourseId);

  const result = await storageService.uploadBuffer(folder, req.file.originalname, req.file.mimetype, req.file.buffer);

  console.log(`✅ [proxyUpload] آپلود موفق: key=${result.key}, lectureId=${lectureId}, contentItemId=${contentItemId}, type=${type}`);

  // ─── آپدیت Lecture و/یا ContentItem ───
  if (lectureId) {
    const lecture = await Lecture.findById(lectureId);

    if (lecture) {
      // ✅ آپدیت contentItem اگر contentItemId مشخص شده
      if (contentItemId && lecture.contentItems && lecture.contentItems.length > 0) {
        const contentItem = lecture.contentItems.find(
          (item: any) => item._id?.toString() === contentItemId
        );

        if (contentItem) {
          // آپدیت storage (مشترک بین همه انواع)
          (contentItem as any).storage = {
            provider: 'arvan',
            bucket: process.env.S3_BUCKET || 'iranian-udemy-videos',
            key: result.key,
            originalFileName: req.file.originalname,
          };

          // آپدیت فیلدهای مخصوص هر نوع
          switch (contentItem.type) {
            case 'image':
              (contentItem as any).imageUrl = result.url;
              if (!contentItem.fileName) (contentItem as any).fileName = req.file.originalname;
              if (!contentItem.fileSize) (contentItem as any).fileSize = req.file.size;
              if (!(contentItem as any).fileType) (contentItem as any).fileType = req.file.mimetype;
              break;

            case 'attachment':
              (contentItem as any).fileUrl = result.url;
              if (!contentItem.fileName) (contentItem as any).fileName = req.file.originalname;
              if (!contentItem.fileSize) (contentItem as any).fileSize = req.file.size;
              if (!(contentItem as any).fileType) (contentItem as any).fileType = req.file.mimetype;
              break;

            case 'audio':
              (contentItem as any).audioUrl = result.url;
              if (!contentItem.audioFileName) (contentItem as any).audioFileName = req.file.originalname;
              if (!contentItem.audioFileSize) (contentItem as any).audioFileSize = req.file.size;
              if (duration > 0 && !contentItem.audioDuration) (contentItem as any).audioDuration = duration;
              break;

            case 'video':
              (contentItem as any).videoUrl = result.url;
              if (!contentItem.videoFileName) (contentItem as any).videoFileName = req.file.originalname;
              if (!contentItem.videoFileSize) (contentItem as any).videoFileSize = req.file.size;
              if (duration > 0) (contentItem as any).videoDuration = duration;
              break;
          }

          // ✅ FIX: آپدیت processing.status به READY
          //         بدون این fix، پلیر پیام "ویدیو در حال آماده‌سازی است" نشان می‌دهد.
          (contentItem as any).processing = buildCompletedProcessing((contentItem as any).processing);

          (contentItem as any).updatedAt = new Date();
          lecture.markModified('contentItems');

          console.log(
            `✅ [proxyUpload] contentItem ${contentItemId} (type=${contentItem.type}) ` +
            `آپدیت شد با key=${result.key}, processing=READY`
          );
        } else {
          console.warn(`⚠️ [proxyUpload] contentItem ${contentItemId} در lecture ${lectureId} یافت نشد`);
        }
      }

      // آپدیت فیلدهای legacy درس (برای ویدیوی اصلی / سازگاری عقب)
      if (!contentItemId || type === 'video') {
        lecture.storage = {
          provider: 'arvan',
          bucket: process.env.S3_BUCKET || 'iranian-udemy-videos',
          key: result.key,
          originalFileName: req.file.originalname,
        };
        lecture.videoUrl = result.url;
        if (duration > 0) lecture.duration = duration;

        // ✅ FIX: آپدیت processing.status legacy به READY
        (lecture as any).processing = buildCompletedProcessing((lecture as any).processing);
      }

      await lecture.save();
    }
  }

  // ─── آپدیت Promo Video دوره ───
  if (courseId && (type === 'video' || type === 'promo-video')) {
    const course = await Course.findById(courseId);
    if (course) {
      const anyCourse = course as any;
      anyCourse.promoVideoKey = result.key;
      anyCourse.promoVideoBucket = process.env.S3_BUCKET || 'iranian-udemy-videos';
      anyCourse.promoVideoStorage = { provider: 'arvan', key: result.key };
      anyCourse.promoVideo = result.url;
      anyCourse.promoVideoType = 'upload';
      await course.save();
    }
  }

  return ApiResponse.success(res, { url: result.url, key: result.key }, 'آپلود با موفقیت انجام شد');
});

// ==================== ۳. دریافت آدرس پخش استریم ====================
export const getPlaybackUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { lectureId } = req.params;
  const resourceId = req.query.resourceId as string | undefined;

  let courseId: any = null;
  let isFreePreview = false;
  let duration = 0;
  let hasValidVideo = false;

  const lecture = await Lecture.findById(lectureId);
  if (lecture) {
    courseId = lecture.course;
    isFreePreview = !!lecture.isFreePreview;
    duration = lecture.duration || 0;

    // ✅ جستجو در contentItems
    if (lecture.contentItems && lecture.contentItems.length > 0) {
      let videoItem: any = null;

      if (resourceId) {
        videoItem = lecture.contentItems.find((item: any) =>
          item._id?.toString() === resourceId
        );
      }

      if (!videoItem && !resourceId) {
        videoItem = lecture.contentItems.find((item: any) =>
          item.type === 'video' && (item.storage?.key || item.videoUrl)
        );
      }

      if (videoItem && (videoItem.storage?.key || videoItem.videoUrl)) {
        hasValidVideo = true;
        duration = videoItem.videoDuration || duration;
      }
    }

    if (!resourceId && !hasValidVideo && (lecture.storage?.key || lecture.videoUrl)) {
      hasValidVideo = true;
    }
  }


  if (!hasValidVideo) {
    throw ApiError.notFound('فایل ویدیو یافت نشد');
  }

  await assertContentAccess(req, courseId, isFreePreview);
  if (lecture?.isPublished === false && !(await courseAccess(req, courseId)).manager) throw ApiError.notFound('درس یافت نشد');

  const apiBase = process.env.API_URL || (req.hostname === 'localhost' ? 'http://localhost:5000' : `${req.protocol}://${req.get('host')}`);
  const streamToken = signStreamToken(req.user._id.toString(), req.user.role, lectureId);
  const streamUrl = `${apiBase}/api/v1/upload/stream/${lectureId}?t=${encodeURIComponent(streamToken)}${resourceId ? `&resourceId=${resourceId}` : ''}`;

  return ApiResponse.success(res, {
    url: streamUrl,
    type: 'mp4',
    duration,
    expiresIn: 900,
  });
});

// ==================== ۴. استریم زنده ویدیو درس‌ها ====================
export const streamLectureVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    tryAuthFromStreamToken(req);
    const { lectureId } = req.params;
    const resourceId = req.query.resourceId as string | undefined;
    let s3Key = '';
    let courseId: any = null;
    let isFreePreview = false;
    let foundVia = 'none';

    const lecture = await Lecture.findById(lectureId);
    if (lecture) {
      courseId = lecture.course;
      isFreePreview = !!lecture.isFreePreview;

      if (lecture.contentItems && lecture.contentItems.length > 0) {
        let videoItem: any = null;

        if (resourceId) {
          videoItem = lecture.contentItems.find((item: any) =>
            item._id?.toString() === resourceId
          );

          if (videoItem) {
            const rawKey = videoItem.storage?.key || videoItem.videoUrl || videoItem.fileUrl || '';
            s3Key = extractS3Key(rawKey);
            if (s3Key) foundVia = `contentItem[${resourceId}].${videoItem.storage?.key ? 'storage.key' : 'videoUrl'}`;
          }
        }

        if (!s3Key && !resourceId) {
          videoItem = lecture.contentItems.find((item: any) =>
            item.type === 'video' && (item.storage?.key || item.videoUrl || item.fileUrl)
          );
          if (videoItem) {
            const rawKey = videoItem.storage?.key || videoItem.videoUrl || videoItem.fileUrl || '';
            s3Key = extractS3Key(rawKey);
            if (s3Key) foundVia = `contentItem[first-video].${videoItem.storage?.key ? 'storage.key' : 'videoUrl'}`;
          }
        }
      }

      if (!s3Key && !resourceId) {
        const rawKey = lecture.storage?.key || lecture.videoUrl || lecture.fileUrl || '';
        s3Key = extractS3Key(rawKey);
        if (s3Key) foundVia = `lecture.${lecture.storage?.key ? 'storage.key' : 'videoUrl'}`;
      }
    }

    if (!s3Key && !resourceId) {
      const course = await Course.findById(lectureId);
      if (course) {
        const anyCourse = course as any;
        const rawKey = anyCourse.promoVideoKey || anyCourse.promoVideo || anyCourse.promoVideoUrl || '';
        s3Key = extractS3Key(rawKey);
        if (s3Key) { foundVia = 'promoVideo'; courseId = course._id; isFreePreview = true; }
      }
    }

    if (!s3Key) {
      res.status(404).json({ message: 'فایل ویدیو یافت نشد' });
      return;
    }



    await assertContentAccess(req, courseId, isFreePreview);
    if (lecture?.isPublished === false && !(await courseAccess(req, courseId)).manager) throw ApiError.notFound('درس یافت نشد');

    if (req.method === 'HEAD') {
      const fileInfo = await storageService.getFileInfo(s3Key);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fileInfo?.size || 0,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': "default-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-src 'self'",
      });
      res.end();
      return;
    }

    const range = req.headers.range;
    const { stream, contentLength, contentRange, totalSize } = await storageService.getVideoStream(s3Key, range);

    const securityHeaders: Record<string, any> = {
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-src 'self'",
    };

    if (contentRange) {
      res.writeHead(206, {
        ...securityHeaders,
        'Content-Range': contentRange,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength,
        'Content-Type': 'video/mp4',
      });
    } else {
      res.writeHead(200, {
        ...securityHeaders,
        'Content-Length': totalSize || contentLength,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
    }

    stream.pipe(res);
  } catch (error) {
    if (error instanceof ApiError) {
      if (!res.headersSent) {
        res.status(error.statusCode).json({
          success: false,
          statusCode: error.statusCode,
          message: error.message,
        });
      }
      return;
    }
    console.error('❌ خطا در استریم ویدیو:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'خطا در بارگذاری استریم ویدیو' });
    }
  }
};

// ==================== ۴ب. استریم ویدیوی معرفی دوره ====================
export const streamPromoVideo = async (req: Request, res: Response): Promise<void> => {
  try {
    tryAuthFromStreamToken(req);
    const { courseId } = req.params;
    let s3Key = '';

    const course = await Course.findById(courseId);
    if (course) {
      const anyCourse = course as any;
      const rawKey = anyCourse.promoVideoKey || anyCourse.promoVideo || anyCourse.promoVideoUrl || '';
      s3Key = extractS3Key(rawKey);
    }

    if (!s3Key) {
      res.status(404).json({ message: 'فایل ویدیوی معرفی یافت نشد' });
      return;
    }

    await assertContentAccess(req, courseId, true);

    if (req.method === 'HEAD') {
      const fileInfo = await storageService.getFileInfo(s3Key);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': fileInfo?.size || 0,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=86400',
        'Content-Security-Policy': "default-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-src 'self'",
      });
      res.end();
      return;
    }

    const range = req.headers.range;
    const { stream, contentLength, contentRange, totalSize } = await storageService.getVideoStream(s3Key, range);

    const securityHeaders: Record<string, any> = {
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400',
      'Content-Security-Policy': "default-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-src 'self'",
    };

    if (contentRange) {
      res.writeHead(206, {
        ...securityHeaders,
        'Content-Range': contentRange,
        'Accept-Ranges': 'bytes',
        'Content-Length': contentLength,
        'Content-Type': 'video/mp4',
      });
    } else {
      res.writeHead(200, {
        ...securityHeaders,
        'Content-Length': totalSize || contentLength,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
    }

    stream.pipe(res);
  } catch (error) {
    if (error instanceof ApiError) {
      if (!res.headersSent) {
        res.status(error.statusCode).json({
          success: false,
          statusCode: error.statusCode,
          message: error.message,
        });
      }
      return;
    }
    console.error('❌ خطا در استریم ویدیوی معرفی:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'خطا در بارگذاری استریم ویدیوی معرفی' });
    }
  }
};

// ==================== ۵. سرویس هوشمند مدیریت فایل‌ها ====================
export const serveFile = asyncHandler(async (req: Request, res: Response) => {
  tryAuthFromStreamToken(req);
  const { lectureId } = req.params;
  const download = req.query.download === 'true';
  const resourceId = req.query.resourceId as string | undefined;

  let fileKey = '';
  let originalName = 'file';
  let accessCourseId: any = null;
  let isFreePreview = false;
  let contentTypeOverride: string | null = null;

  const lecture = await Lecture.findById(lectureId);

  if (lecture) {
    accessCourseId = lecture.course;
    isFreePreview = !!lecture.isFreePreview;

    if (resourceId) {
      const contentItem = lecture.contentItems?.find((item: any) => {
        const itemId = item._id?.toString() || item.id?.toString();
        return itemId === resourceId;
      });

      if (contentItem) {
        const rawKey = (contentItem as any).storage?.key
          || (contentItem as any).imageUrl
          || (contentItem as any).fileUrl
          || (contentItem as any).audioUrl
          || (contentItem as any).videoUrl
          || '';

        fileKey = extractS3Key(rawKey);

        originalName = (contentItem as any).title
          || (contentItem as any).fileName
          || (contentItem as any).audioFileName
          || (contentItem as any).videoFileName
          || 'file';

        contentTypeOverride = (contentItem as any).fileType
          || (contentItem as any).mimeType
          || null;


      } else {
        const resource = lecture.resources?.find(
          (r: any) => r._id?.toString() === resourceId || r.id?.toString() === resourceId
        );
        if (resource) {
          fileKey = extractS3Key(resource.url || '');
          originalName = resource.title || 'file';
        }
      }
    }

    if (!fileKey && !resourceId) {
      const rawLegacy = lecture.storage?.key || lecture.fileUrl || '';
      fileKey = extractS3Key(rawLegacy);
      originalName = lecture.storage?.originalFileName || lecture.fileName || 'file';
    }
  }

  if (!fileKey) {
    throw ApiError.notFound('فایل یافت نشد');
  }

  await assertContentAccess(req, accessCourseId, isFreePreview);
  if (lecture?.isPublished === false && !(await courseAccess(req, accessCourseId)).manager) throw ApiError.notFound('درس یافت نشد');

  const lowerKey = fileKey.toLowerCase();
  const isInlineType = /\.(pdf|png|jpg|jpeg|gif|txt|webp|svg|avif)$/.test(lowerKey);

  const fileInfo = await storageService.getFileInfo(fileKey);
  const contentType = contentTypeOverride || fileInfo?.contentType || 'application/octet-stream';
  const totalSize = fileInfo?.size || 0;

  const disposition = isInlineType && !download ? 'inline' : 'attachment';
  const safeName = originalName.replace(/[/\\?%*:|"<>\s]/g, '_') || 'file';

  if (req.method === 'HEAD') {
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': totalSize,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(safeName)}"`,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.end();
    return;
  }

  const range = req.headers.range;
  const { stream, contentLength, contentRange, totalSize: streamTotal } =
    await storageService.getVideoStream(fileKey, range);

  const headers: Record<string, any> = {
    'Content-Type': contentType,
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(safeName)}"`,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-src 'self'",
  };

  if (contentRange) {
    res.writeHead(206, { ...headers, 'Content-Range': contentRange, 'Content-Length': contentLength });
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': streamTotal || contentLength });
  }

  stream.pipe(res);
});

// ==================== ۶. تمدید URL منقضی‌شده ====================
export const refreshPlaybackUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const lectureId = req.body?.lectureId;
  const resourceId = req.body?.resourceId;
  if (!lectureId || lectureId === 'undefined' || lectureId === 'null') {
    throw ApiError.badRequest('lectureId نامعتبر است');
  }

  let refreshCourseId: any = null;
  let isFreePreview = false;
  const lectureDoc = await Lecture.findById(lectureId).select('course isFreePreview isPublished contentItems storage videoUrl');

  if (lectureDoc) {
    refreshCourseId = lectureDoc.course;
    isFreePreview = !!lectureDoc.isFreePreview;

    let hasVideo = false;
    if (lectureDoc.contentItems && lectureDoc.contentItems.length > 0) {
      let videoItem;
      if (resourceId) {
        videoItem = lectureDoc.contentItems.find((item: any) =>
          item._id?.toString() === resourceId &&
          (item.storage?.key || item.videoUrl)
        );
      } else {
        videoItem = lectureDoc.contentItems.find((item: any) =>
          item.type === 'video' && (item.storage?.key || item.videoUrl)
        );
      }
      if (videoItem) hasVideo = true;
    }

    if (!resourceId && !hasVideo && (lectureDoc.storage?.key || lectureDoc.videoUrl)) {
      hasVideo = true;
    }

    if (!hasVideo) {
      throw ApiError.notFound('ویدیو در محتوای درس یافت نشد');
    }
  } else {
    const promoCourse = await Course.findById(lectureId).select('_id');
    if (!promoCourse) throw ApiError.notFound('محتوا یافت نشد');
    refreshCourseId = promoCourse._id;
    isFreePreview = true;
  }

  await assertContentAccess(req, refreshCourseId, isFreePreview);
  if (lectureDoc?.isPublished === false && !(await courseAccess(req, refreshCourseId)).manager) throw ApiError.notFound('درس یافت نشد');

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  const apiBase = process.env.API_URL || (req.hostname === 'localhost' ? 'http://localhost:5000' : `${req.protocol}://${req.get('host')}`);
  const streamToken = signStreamToken(req.user._id.toString(), req.user.role, lectureId);
  const streamUrl = `${apiBase}/api/v1/upload/stream/${lectureId}?t=${encodeURIComponent(streamToken)}${resourceId ? `&resourceId=${resourceId}` : ''}`;

  return ApiResponse.success(res, {
    url: streamUrl,
    type: 'mp4',
    expiresIn: 900,
  });
});

// ==================== ۷. Multipart Upload ====================
export const initMultipartUpload = asyncHandler(async (req: Request, res: Response) => {
  requireInstructor(req);
  const { fileName, contentType, folder, totalSize, partSize, type } = req.body;
  if (!fileName || !contentType || !folder || !totalSize) {
    throw ApiError.badRequest('اطلاعات ناقص است');
  }

  const uploadType = (type as string) || 'resource';
  if (!storageService.validateContentType(contentType, uploadType as 'video' | 'resource' | 'audio')) {
    throw ApiError.badRequest('فرمت فایل مجاز نیست');
  }

  if (!storageService.validateFileSize(totalSize, uploadType as 'video' | 'resource' | 'audio')) {
    throw ApiError.badRequest('حجم فایل مجاز نیست');
  }

  const safeFolder = sanitizeFolder(folder);
  const result = await storageService.initiateMultipartUpload(fileName, contentType, safeFolder, totalSize, partSize);
  return ApiResponse.success(res, result, 'Multipart upload آغاز شد');
});

export const completeMultipartUpload = asyncHandler(async (req: Request, res: Response) => {
  requireInstructor(req);
  const { key, uploadId, parts } = req.body;
  if (!key || !uploadId || !parts) {
    throw ApiError.badRequest('اطلاعات ناقص است');
  }

  const result = await storageService.completeMultipartUpload(key, uploadId, parts);
  return ApiResponse.success(res, result, 'Multipart upload تکمیل شد');
});

export const abortMultipartUpload = asyncHandler(async (req: Request, res: Response) => {
  requireInstructor(req);
  const { key, uploadId } = req.body;
  if (!key || !uploadId) {
    throw ApiError.badRequest('اطلاعات ناقص است');
  }

  await storageService.abortMultipartUpload(key, uploadId);
  return ApiResponse.success(res, {}, 'Multipart upload لغو شد');
});

export const getProcessingStatus = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse.success(res, { status: 'READY' }, 'وضعیت پردازش');
});

// ==================== ۸. آپلود فایل تمرین توسط دانشجو ====================
export const submitDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  if (!req.file) throw ApiError.badRequest('فایلی ارسال نشد');

  const folder = `submissions/${req.user._id.toString()}`;
  const result = await storageService.uploadBuffer(
    folder,
    req.file.originalname,
    req.file.mimetype,
    req.file.buffer,
  );

  return ApiResponse.success(
    res,
    {
      url: result.url,
      key: result.key,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    },
    'فایل با موفقیت آپلود شد',
  );
});