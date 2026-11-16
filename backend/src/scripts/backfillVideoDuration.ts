/**
 * 🔄 Backfill Video Duration Migration
 *
 * اسکریپت بازیابی مدت زمان ویدئوهایی که قبلاً آپلود شده‌اند
 * اما Duration آنها استخراج نشده است.
 *
 * Usage:
 *   npx ts-node src/scripts/backfillVideoDuration.ts
 *   یا
 *   npm run backfill:video-duration
 *
 * قابلیت‌ها:
 *   - ایمن برای اجرای مجدد (idempotent)
 *   - فقط رکوردهایی با duration=0 یا بدون duration را پردازش می‌کند
 *   - خطا در یک فایل، کل فرآیند را متوقف نمی‌کند
 *   - Log کامل پیشرفت و خطاها
 *   - Recalculate section و course stats بعد از هر بروزرسانی
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Lecture from '../models/Lecture';
import Section from '../models/Section';
import Course from '../models/Course';
import { extractDurationFromS3, extractDurationFromFile, checkFFmpegAvailable } from '../utils/videoMetadata';

// ─── بارگذاری متغیرهای محیطی ───
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/iranian-udemy';

// ─── آمار اجرا ───
interface Stats {
  total: number;
  skipped: number;
  updated: number;
  failed: number;
  noVideo: number;
}

/**
 * Recalculate section stats after updating lectures
 */
async function recalculateSectionStats(sectionId: string): Promise<void> {
  const lectures = await Lecture.find({ section: sectionId }).lean();
  const totalLectures = lectures.length;
  const totalDuration = lectures.reduce((sum, l) => sum + (l.duration || 0), 0);
  await Section.findByIdAndUpdate(sectionId, { totalLectures, totalDuration });
}

/**
 * Recalculate course stats from all sections
 */
async function recalculateCourseStats(courseId: string): Promise<void> {
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
}

/**
 * استخراج duration از فایل محلی یا S3
 */
async function extractDuration(lecture: any): Promise<number> {
  // اگر storage key وجود دارد (S3)
  if (lecture.storage?.key) {
    return await extractDurationFromS3(lecture.storage.key);
  }

  // اگر videoUrl یک فایل محلی است
  if (lecture.videoUrl && !lecture.videoUrl.startsWith('http')) {
    const localPath = path.resolve(__dirname, '../../', lecture.videoUrl);
    return extractDurationFromFile(localPath);
  }

  // اگر videoUrl یک URL خارجی است — نمی‌توانیم استخراج کنیم
  return 0;
}

/**
 * اجرای اصلی Backfill
 */
async function backfill(): Promise<void> {
  console.log('🔄 [Backfill] شروع بازیابی مدت زمان ویدئوها...\n');

  // بررسی FFmpeg
  if (!checkFFmpegAvailable()) {
    console.error('❌ [Backfill] FFmpeg روی سرور نصب نیست. لطفاً ابتدا FFmpeg را نصب کنید.');
    process.exit(1);
  }
  console.log('✅ [Backfill] FFmpeg موجود است.\n');

  // اتصال به دیتابیس
  console.log('📡 [Backfill] اتصال به MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ [Backfill] اتصال برقرار شد.\n');

  // پیدا کردن lectures بدون duration
  const lectures = await Lecture.find({
    $or: [
      { duration: { $exists: false } },
      { duration: null },
      { duration: 0 },
    ],
    type: 'video', // فقط ویدئوها
  }).lean();

  const stats: Stats = {
    total: lectures.length,
    skipped: 0,
    updated: 0,
    failed: 0,
    noVideo: 0,
  };

  console.log(`📋 [Backfill] تعداد دروس ویدئویی بدون مدت زمان: ${stats.total}\n`);

  if (stats.total === 0) {
    console.log('✅ [Backfill] همه دروس دارای مدت زمان هستند. نیازی به بازیابی نیست.');
    await mongoose.disconnect();
    return;
  }

  // پردازش هر lecture
  const affectedCourses = new Set<string>();
  const affectedSections = new Set<string>();

  for (let i = 0; i < lectures.length; i++) {
    const lecture = lectures[i];
    const progress = `[${i + 1}/${stats.total}]`;

    console.log(`${progress} در حال پردازش: "${lecture.title}" (${lecture._id})`);

    // بررسی وجود فایل ویدئو
    if (!lecture.videoUrl && !lecture.storage?.key) {
      console.log(`  ⏭️  فایل ویدئو یافت نشد — رد شد`);
      stats.noVideo++;
      continue;
    }

    try {
      const duration = await extractDuration(lecture);

      if (duration > 0) {
        await Lecture.findByIdAndUpdate(lecture._id, { duration });
        console.log(`  ✅ مدت زمان: ${duration} ثانیه`);
        stats.updated++;

        // ردیابی section و course برای recalculate
        if (lecture.section) affectedSections.add(lecture.section.toString());
        if (lecture.course) affectedCourses.add(lecture.course.toString());
      } else {
        console.log(`  ⚠️  مدت زمان قابل استخراج نبود`);
        stats.failed++;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'خطای ناشناخته';
      console.error(`  ❌ خطا: ${msg}`);
      stats.failed++;
    }
  }

  // Recalculate section و course stats
  if (affectedSections.size > 0 || affectedCourses.size > 0) {
    console.log('\n🔄 [Backfill] بازمحاسبه آمار فصل‌ها و دوره‌ها...');

    for (const sectionId of affectedSections) {
      try {
        await recalculateSectionStats(sectionId);
      } catch (error) {
        console.error(`  ❌ خطا در بازمحاسبه فصل ${sectionId}:`, error);
      }
    }

    for (const courseId of affectedCourses) {
      try {
        await recalculateCourseStats(courseId);
      } catch (error) {
        console.error(`  ❌ خطا در بازمحاسبه دوره ${courseId}:`, error);
      }
    }

    console.log('✅ [Backfill] بازمحاسبه آمار تکمیل شد.');
  }

  // نمایش خلاصه
  console.log('\n' + '═'.repeat(50));
  console.log('📊 [Backfill] خلاصه نتایج:');
  console.log('═'.repeat(50));
  console.log(`  📋 مجموع دروس:     ${stats.total}`);
  console.log(`  ✅ بروزرسانی شده:   ${stats.updated}`);
  console.log(`  ⏭️  بدون فایل ویدئو: ${stats.noVideo}`);
  console.log(`  ❌ ناموفق:          ${stats.failed}`);
  console.log('═'.repeat(50));

  await mongoose.disconnect();
  console.log('\n✅ [Backfill] اتصال قطع شد.');
}

// ─── اجرا ───
backfill().catch((error) => {
  console.error('❌ [Backfill] خطای کلی:', error);
  mongoose.disconnect().finally(() => process.exit(1));
});
