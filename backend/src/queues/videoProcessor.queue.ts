/**
 * 📥 Video Processor Queue — BullMQ
 *
 * صف پردازش ویدیو برای تبدیل MP4 → HLS و تولید thumbnail.
 * از BullMQ استفاده می‌کند (نه Agenda).
 */

import { Queue, QueueEvents } from 'bullmq';
import Redis from 'ioredis';

// ─── اتصال به Redis ───
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

// اتصال جداگانه برای BullMQ (نیاز به maxRetriesPerRequest: null دارد)
const connection = new Redis(redisConfig);

// ─── نام صف ───
const QUEUE_NAME = 'video-processing';

// ─── ساخت صف ───
const videoProcessingQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3, // تلاش مجدد ۳ بار
    backoff: {
      type: 'exponential',
      delay: 5000, // ۵ ثانیه اولیه، سپس ۱۰، ۲۰
    },
    removeOnComplete: {
      age: 86400, // ۲۴ ساعت نگه‌داری
      count: 100, // حداکثر ۱۰۰ job تکمیل شده
    },
    removeOnFail: {
      age: 604800, // ۷ روز نگه‌داری
    },
  },
});

// ─── رویدادها ───
const queueEvents = new QueueEvents(QUEUE_NAME, { connection });

queueEvents.on('completed', ({ jobId }) => {
  console.log(`✅ [VideoProcessor] Job ${jobId} تکمیل شد`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ [VideoProcessor] Job ${jobId} شکست خورد:`, failedReason);
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`📊 [VideoProcessor] Job ${jobId} پیشرفت: ${data}%`);
});

// ─── توابع کمکی ───

/**
 * اضافه کردن job پردازش ویدیو به صف
 */
export const addVideoProcessingJob = async (
  lectureId: string,
  storageKey: string,
  bucket: string,
): Promise<string> => {
  const job = await videoProcessingQueue.add(
    'transcode-hls',
    {
      lectureId,
      storageKey,
      bucket,
    },
    {
      priority: 1, // اولویت بالا
    },
  );

  console.log(`📥 [VideoProcessor] Job ${job.id} برای درس ${lectureId} اضافه شد`);
  return job.id!;
};

/**
 * اضافه کردن job تولید thumbnail
 */
export const addThumbnailJob = async (
  lectureId: string,
  storageKey: string,
  bucket: string,
): Promise<string> => {
  const job = await videoProcessingQueue.add(
    'generate-thumbnails',
    {
      lectureId,
      storageKey,
      bucket,
    },
    {
      priority: 2,
    },
  );

  return job.id!;
};

/**
 * اضافه کردن job پاکسازی فایل‌های ناقص
 */
export const addCleanupJob = async (
  storageKey: string,
  bucket: string,
): Promise<string> => {
  const job = await videoProcessingQueue.add(
    'cleanup-failed',
    {
      storageKey,
      bucket,
    },
    {
      priority: 3,
    },
  );

  return job.id!;
};

/**
 * دریافت وضعیت job
 */
export const getJobStatus = async (jobId: string) => {
  const job = await videoProcessingQueue.getJob(jobId);
  if (!job) return null;

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    progress: job.progress,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    state: await job.getState(),
  };
};

export { videoProcessingQueue, connection as redisConnection };
