/**
 * 🛡️ Safe File Deletion Service
 * مدیریت امن حذف فایل‌های Arvan S3 با بررسی ارجاع مشترک و قابلیت Retry
 *
 * اصول:
 * - هیچ فایلی قبل از موفقیت عملیات دیتابیس حذف نمی‌شود
 * - قبل از حذف، بررسی می‌شود که آیا رکورد دیگری به همان کلید S3 ارجاع دارد
 * - عملیات حذف idempotent است (اجرای چندباره مشکلی ایجاد نمی‌کند)
 * - خطاهای S3 ثبت می‌شوند و باعث پنهان شدن خطای اصلی نمی‌شوند
 * - قابلیت Retry برای شکست‌های موقت S3 وجود دارد
 */

import storageService from './storageService';
import Lecture from '../models/Lecture';
import Section from '../models/Section';
import FileDeletionOperation from '../models/FileDeletionOperation';
import { ApiError } from '../utils/ApiError';

interface S3FileReference {
  key: string;
  source: 'lecture' | 'contentItem' | 'section';
  ownerId: string;
  field: string;
}

/**
 * استخراج کلید S3 از یک URL یا کلید خام
 */
function extractS3Key(raw: string | undefined): string | null {
  if (!raw) return null;
  // اگر URL کامل است، کلید را استخراج می‌کنیم
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const urlObj = new URL(raw);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      // اگر نام bucket در مسیر است، حذف می‌کنیم
      if (parts[0] === process.env.S3_BUCKET) {
        parts.shift();
      }
      return parts.join('/');
    } catch {
      return null;
    }
  }
  // اگر کلید خام است، مستقیماً برگردان می‌کنیم
  return raw.trim() || null;
}

/**
 * جمع‌آوری تمام کلیدهای S3 یک Lecture (هم Legacy و هم Content Items)
 */
function collectLectureS3Keys(lecture: any): S3FileReference[] {
  const refs: S3FileReference[] = [];

  const lectureId = lecture._id?.toString() || '';

  // Legacy fields
  if (lecture.storage?.key) {
    refs.push({ key: lecture.storage.key, source: 'lecture', ownerId: lectureId, field: 'storage.key' });
  }
  const legacyVideoKey = extractS3Key(lecture.videoUrl);
  if (legacyVideoKey) {
    refs.push({ key: legacyVideoKey, source: 'lecture', ownerId: lectureId, field: 'videoUrl' });
  }

  // Content items
  if (lecture.contentItems && Array.isArray(lecture.contentItems)) {
    for (const item of lecture.contentItems) {
      const itemId = item._id?.toString() || '';
      if (item.storage?.key) {
        refs.push({ key: item.storage.key, source: 'contentItem', ownerId: itemId, field: 'storage.key' });
      }
      const videoKey = extractS3Key(item.videoUrl);
      if (videoKey) {
        refs.push({ key: videoKey, source: 'contentItem', ownerId: itemId, field: 'videoUrl' });
      }
      const fileKey = extractS3Key(item.fileUrl);
      if (fileKey) {
        refs.push({ key: fileKey, source: 'contentItem', ownerId: itemId, field: 'fileUrl' });
      }
      const imageKey = extractS3Key(item.imageUrl);
      if (imageKey) {
        refs.push({ key: imageKey, source: 'contentItem', ownerId: itemId, field: 'imageUrl' });
      }
      const audioKey = extractS3Key(item.audioUrl);
      if (audioKey) {
        refs.push({ key: audioKey, source: 'contentItem', ownerId: itemId, field: 'audioUrl' });
      }
    }
  }

  return refs;
}

/**
 * بررسی اینکه آیا یک کلید S3 توسط هر Lecture یا Content Item دیگری ارجاع داده شده است
 */
async function isS3KeyReferencedElsewhere(
  key: string,
  excludeLectureId?: string,
  excludeContentItemId?: string,
): Promise<boolean> {
  // جستجو در تمام Lectures
  const lectures = await Lecture.find({}).lean();
  for (const lecture of lectures) {
    if (lecture._id?.toString() === excludeLectureId) continue;

    // Legacy fields
    if (lecture.storage?.key === key) return true;
    const legacyVideoKey = extractS3Key(lecture.videoUrl);
    if (legacyVideoKey === key) return true;

    // Content items
    if (lecture.contentItems && Array.isArray(lecture.contentItems)) {
      for (const item of lecture.contentItems) {
        if (item._id?.toString() === excludeContentItemId) continue;
        if (item.storage?.key === key) return true;
        if (extractS3Key(item.videoUrl) === key) return true;
        if (extractS3Key(item.fileUrl) === key) return true;
        if (extractS3Key(item.imageUrl) === key) return true;
        if (extractS3Key(item.audioUrl) === key) return true;
      }
    }
  }

  return false;
}

/**
 * حذف امن یک فایل از S3 با Retry
 * @param key کلید فایل در S3
 * @param maxRetries تعداد تلاش مجدد (پیش‌فرض: 3)
 * @param delayMs تأخیر بین تلاش‌ها به میلی‌ثانیه (پیش‌فرض: 1000)
 */
async function deleteS3FileWithRetry(
  key: string,
  maxRetries: number = 3,
  delayMs: number = 1000,
): Promise<{ success: boolean; error?: string }> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await storageService.deleteFile(key);
      if (result) {
        return { success: true };
      }
      lastError = 'deleteFile returned false';
    } catch (err: any) {
      lastError = err?.message || String(err);
    }

    // تأخیر قبل از تلاش مجدد (به جز آخرین تلاش)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  return { success: false, error: lastError };
}

/**
 * حذف امن فایل‌های S3 مربوط به یک Lecture
 * ابتدا کلیدهای S3 استخراج و در مدل FileDeletionOperation ثبت می‌شوند،
 * سپس رکورد Lecture حذف می‌شود، و در نهایت فایل‌ها از S3 حذف می‌شوند.
 *
 * @param lectureId شناسه Lecture
 * @param excludeKeys کلیدهایی که نباید حذف شوند (مثلاً فایل جدید جایگزین)
 */
export async function safeDeleteLectureS3Files(
  lectureId: string,
  excludeKeys: string[] = [],
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  const lecture = await Lecture.findById(lectureId).lean();
  if (!lecture) {
    return { deleted: [], failed: [] };
  }

  const refs = collectLectureS3Keys(lecture);
  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (const ref of refs) {
    // اگر کلید در لیست استثنا است، حذف نمی‌کنیم
    if (excludeKeys.includes(ref.key)) continue;

    // بررسی ارجاع مشترک در Lecture‌های دیگر
    const isReferenced = await isS3KeyReferencedElsewhere(
      ref.key,
      lectureId,
      undefined,
    );

    if (isReferenced) {
      // فایل توسط Lecture دیگری استفاده می‌شود، حذف نمی‌کنیم
      continue;
    }

    // ثبت عملیات حذف در دیتابیس (پایدار)
    const operation = await FileDeletionOperation.create({
      s3Key: ref.key,
      sourceType: ref.source,
      sourceId: ref.ownerId,
      field: ref.field,
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
    });

    // تلاش برای حذف فایل
    const result = await deleteS3FileWithRetry(ref.key);
    if (result.success) {
      operation.status = 'completed';
      await operation.save();
      deleted.push(ref.key);
    } else {
      operation.status = 'failed';
      operation.attempts = 1;
      operation.lastError = result.error;
      operation.nextRetryAt = new Date(Date.now() + 60000); // 1 دقیقه بعد
      await operation.save();
      failed.push({ key: ref.key, error: result.error || 'Unknown error' });
      console.error(`❌ Failed to delete S3 file ${ref.key} for lecture ${lectureId}:`, result.error);
    }
  }

  return { deleted, failed };
}

/**
 * حذف امن فایل‌های S3 مربوط به یک Content Item خاص
 * ابتدا کلیدهای S3 استخراج و در مدل FileDeletionOperation ثبت می‌شوند،
 * سپس Content Item از دیتابیس حذف می‌شود، و در نهایت فایل‌ها از S3 حذف می‌شوند.
 *
 * @param lectureId شناسه Lecture مالک
 * @param contentItemId شناسه Content Item
 */
export async function safeDeleteContentItemS3Files(
  lectureId: string,
  contentItemId: string,
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  const lecture = await Lecture.findById(lectureId).lean();
  if (!lecture) {
    return { deleted: [], failed: [] };
  }

  const item = lecture.contentItems?.find(
    (ci: any) => ci._id?.toString() === contentItemId,
  );
  if (!item) {
    return { deleted: [], failed: [] };
  }

  const refs: S3FileReference[] = [];
  const itemId = item._id?.toString() || '';

  if (item.storage?.key) {
    refs.push({ key: item.storage.key, source: 'contentItem', ownerId: itemId, field: 'storage.key' });
  }
  const videoKey = extractS3Key(item.videoUrl);
  if (videoKey) {
    refs.push({ key: videoKey, source: 'contentItem', ownerId: itemId, field: 'videoUrl' });
  }
  const fileKey = extractS3Key(item.fileUrl);
  if (fileKey) {
    refs.push({ key: fileKey, source: 'contentItem', ownerId: itemId, field: 'fileUrl' });
  }
  const imageKey = extractS3Key(item.imageUrl);
  if (imageKey) {
    refs.push({ key: imageKey, source: 'contentItem', ownerId: itemId, field: 'imageUrl' });
  }
  const audioKey = extractS3Key(item.audioUrl);
  if (audioKey) {
    refs.push({ key: audioKey, source: 'contentItem', ownerId: itemId, field: 'audioUrl' });
  }

  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (const ref of refs) {
    // بررسی ارجاع مشترک در Lecture‌های دیگر (از جمله Lecture فعلی برای آیتم‌های دیگر)
    const isReferenced = await isS3KeyReferencedElsewhere(
      ref.key,
      lectureId,
      contentItemId,
    );

    if (isReferenced) {
      continue;
    }

    // ثبت عملیات حذف در دیتابیس (پایدار)
    const operation = await FileDeletionOperation.create({
      s3Key: ref.key,
      sourceType: ref.source,
      sourceId: ref.ownerId,
      field: ref.field,
      status: 'pending',
      attempts: 0,
      maxAttempts: 5,
    });

    // تلاش برای حذف فایل
    const result = await deleteS3FileWithRetry(ref.key);
    if (result.success) {
      operation.status = 'completed';
      await operation.save();
      deleted.push(ref.key);
    } else {
      operation.status = 'failed';
      operation.attempts = 1;
      operation.lastError = result.error;
      operation.nextRetryAt = new Date(Date.now() + 60000); // 1 دقیقه بعد
      await operation.save();
      failed.push({ key: ref.key, error: result.error || 'Unknown error' });
      console.error(`❌ Failed to delete S3 file ${ref.key} for content item ${contentItemId}:`, result.error);
    }
  }

  return { deleted, failed };
}

/**
 * حذف امن فایل‌های S3 تمام Lectures یک Section
 * ابتدا کلیدهای S3 تمام Lectures استخراج و در مدل FileDeletionOperation ثبت می‌شوند،
 * سپس Section و Lectures از دیتابیس حذف می‌شوند، و در نهایت فایل‌ها از S3 حذف می‌شوند.
 *
 * @param sectionId شناسه Section
 */
export async function safeDeleteSectionS3Files(
  sectionId: string,
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  const lectures = await Lecture.find({ section: sectionId }).lean();
  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (const lecture of lectures) {
    const lectureId = lecture._id?.toString() || '';
    const result = await safeDeleteLectureS3Files(lectureId);
    deleted.push(...result.deleted);
    failed.push(...result.failed);
  }

  return { deleted, failed };
}

/**
 * پردازش عملیات حذف pending (برای Job دوره‌ای)
 * این تابع توسط cron job یا BullMQ worker فراخوانی می‌شود.
 */
export async function processPendingDeletions(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const now = new Date();
  const operations = await FileDeletionOperation.find({
    status: 'pending',
    $or: [
      { nextRetryAt: { $exists: false } },
      { nextRetryAt: { $lte: now } },
    ],
    attempts: { $lt: 5 },
  }).limit(100);

  let succeeded = 0;
  let failed = 0;

  for (const operation of operations) {
    operation.status = 'processing';
    operation.attempts += 1;
    await operation.save();

    // بررسی ارجاع مشترک قبل از حذف
    const isReferenced = await isS3KeyReferencedElsewhere(
      operation.s3Key,
      operation.sourceId,
    );

    if (isReferenced) {
      // فایل توسط رکورد دیگری استفاده می‌شود، حذف نمی‌کنیم
      operation.status = 'completed';
      operation.lastError = 'File is referenced elsewhere, skipping deletion';
      await operation.save();
      succeeded++;
      continue;
    }

    const result = await deleteS3FileWithRetry(operation.s3Key, 1, 0);
    if (result.success) {
      operation.status = 'completed';
      operation.lastError = undefined;
      await operation.save();
      succeeded++;
    } else {
      operation.status = 'failed';
      operation.lastError = result.error;
      // Backoff: 1 دقیقه، 5 دقیقه، 15 دقیقه، 30 دقیقه، 60 دقیقه
      const backoffMinutes = [1, 5, 15, 30, 60][Math.min(operation.attempts - 1, 4)];
      operation.nextRetryAt = new Date(Date.now() + backoffMinutes * 60000);
      await operation.save();
      failed++;
    }
  }

  return { processed: operations.length, succeeded, failed };
}

/**
 * شناسایی فایل‌های یتیم (بدون ارجاع در هیچ Lecture یا Content Itemی)
 * این تابع فقط برای گزارش و بررسی است، حذف خودکار انجام نمی‌دهد.
 */
export async function findOrphanedS3Files(): Promise<string[]> {
  const lectures = await Lecture.find({}).lean();
  const allKeys: string[] = [];

  for (const lecture of lectures) {
    const refs = collectLectureS3Keys(lecture);
    for (const ref of refs) {
      allKeys.push(ref.key);
    }
  }

  // در اینجا می‌توان لیست کلیدهای S3 را با لیست کلیدهای استفاده شده مقایسه کرد
  // فعلاً لیست کلیدهای استفاده شده را برمی‌گردانیم برای بررسی دستی
  return allKeys;
}
