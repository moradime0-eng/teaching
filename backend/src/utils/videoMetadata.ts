/**
 * 🎬 Video Metadata Utility — ffprobe-based
 *
 * ✅ FIX: استفاده از ffprobe (نه ffmpeg) — چون در Alpine این دو باینری جدا هستند
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// ✅ FIX: ffprobe جداگانه از ffmpeg
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_TIMEOUT = 30_000; // 30 ثانیه

// ─── S3 Client (lazy singleton) ───
let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'https://s3.ir-thr-at1.arvanstorage.ir',
      region: process.env.S3_REGION || 'ir-thr-at1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    });
  }
  return _s3Client;
}

export interface VideoMetadata {
  duration: number;
  rawDuration: number;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  videoCodec: string;
  audioCodec: string;
  frameRate: number;
  format: string;
}

/**
 * بررسی وجود FFmpeg و FFprobe روی سرور
 */
export function checkFFmpegAvailable(): boolean {
  try {
    execSync(`${FFMPEG_PATH} -version`, { stdio: 'ignore', timeout: 5000 });
    execSync(`${FFPROBE_PATH} -version`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * بررسی جداگانه ffprobe
 */
export function checkFFprobeAvailable(): boolean {
  try {
    execSync(`${FFPROBE_PATH} -version`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * ✅ FIX: استفاده از ffprobe به جای ffmpeg
 *
 * استخراج مدت زمان ویدیو از فایل محلی
 */
export function extractDurationFromFile(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    console.error(`[videoMetadata] فایل یافت نشد: ${filePath}`);
    return 0;
  }

  try {
    // ✅ FIX: از ffprobe استفاده می‌کند (نه ffmpeg)
    const cmd = [
      FFPROBE_PATH,
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      `"${filePath}"`,
    ].join(' ');

    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: FFPROBE_TIMEOUT,
      maxBuffer: 1024 * 1024,
    }).trim();

    const duration = parseFloat(output);
    if (isNaN(duration) || duration < 0) {
      console.warn(`[videoMetadata] مقدار duration نامعتبر: ${output}`);
      return 0;
    }

    return Math.round(duration);
  } catch (error) {
    console.error(`[videoMetadata] خطا در استخراج duration از ${filePath}:`, error);
    return 0;
  }
}

/**
 * ✅ FIX: استخراج metadata کامل با ffprobe
 */
export function extractVideoMetadata(filePath: string): VideoMetadata | null {
  if (!fs.existsSync(filePath)) {
    console.error(`[videoMetadata] فایل یافت نشد: ${filePath}`);
    return null;
  }

  try {
    // ✅ FIX: ffprobe به جای ffmpeg
    const formatCmd = [
      FFPROBE_PATH,
      '-v', 'error',
      '-show_entries', 'format=duration,bit_rate,format_name',
      '-show_entries', 'stream=codec_name,codec_type,width,height,bit_rate,r_frame_rate',
      '-of', 'json',
      `"${filePath}"`,
    ].join(' ');

    const output = execSync(formatCmd, {
      encoding: 'utf-8',
      timeout: FFPROBE_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });

    const data = JSON.parse(output);

    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');

    const rawDuration = parseFloat(data.format?.duration || '0');
    const duration = isNaN(rawDuration) ? 0 : Math.round(rawDuration);

    let frameRate = 0;
    if (videoStream?.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2) {
        const num = parseInt(parts[0]);
        const den = parseInt(parts[1]);
        if (den > 0) frameRate = Math.round(num / den);
      } else {
        frameRate = parseInt(parts[0]) || 0;
      }
    }

    return {
      duration,
      rawDuration,
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      videoBitrate: parseInt(videoStream?.bit_rate || '0') || 0,
      audioBitrate: parseInt(audioStream?.bit_rate || '0') || 0,
      videoCodec: videoStream?.codec_name || 'unknown',
      audioCodec: audioStream?.codec_name || 'unknown',
      frameRate,
      format: data.format?.format_name || 'unknown',
    };
  } catch (error) {
    console.error(`[videoMetadata] خطا در استخراج metadata از ${filePath}:`, error);
    return null;
  }
}

/**
 * دانلود فایل از S3 و استخراج مدت زمان
 */
export async function extractDurationFromS3(key: string): Promise<number> {
  const bucket = process.env.S3_BUCKET || 'iranian-udemy-videos';
  let tmpDir: string | null = null;

  try {
    const tempBase = process.env.TEMP_DIR || os.tmpdir();
    tmpDir = fs.mkdtempSync(path.join(tempBase, 'duration-'));
    const ext = path.extname(key) || '.mp4';
    const localPath = path.join(tmpDir, `video${ext}`);

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await getS3Client().send(command);

    if (!response.Body) {
      throw new Error('بدنه پاسخ S3 خالی است');
    }

    const chunks: Buffer[] = [];
    const nodeStream = response.Body.transformToWebStream();
    const reader = (nodeStream as unknown as ReadableStream<Uint8Array>).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    fs.writeFileSync(localPath, Buffer.concat(chunks));

    return extractDurationFromFile(localPath);
  } catch (error) {
    console.error(`[videoMetadata] خطا در استخراج duration از S3 (${key}):`, error);
    return 0;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}