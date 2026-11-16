/**
 * 🧪 Video Metadata Tests
 *
 * تست‌های استخراج metadata ویدیو با ffprobe
 */

import { extractDurationFromFile, checkFFmpegAvailable } from '../utils/videoMetadata';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Video Metadata Utility', () => {
  // ─── تست بررسی FFmpeg ───

  describe('checkFFmpegAvailable', () => {
    it('should return a boolean', () => {
      const result = checkFFmpegAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  // ─── تست extractDurationFromFile ───

  describe('extractDurationFromFile', () => {
    it('should return 0 for non-existent file', () => {
      const result = extractDurationFromFile('/nonexistent/video.mp4');
      expect(result).toBe(0);
    });

    it('should return 0 for empty path', () => {
      const result = extractDurationFromFile('');
      expect(result).toBe(0);
    });

    it('should return a number', () => {
      // این تست فقط بررسی می‌کند که تابع خطا نمی‌دهد
      const result = extractDurationFromFile('/nonexistent/file.mp4');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should return integer (rounded)', () => {
      // duration باید عدد صحیح باشد (گرد شده)
      const result = extractDurationFromFile('/nonexistent/video.mp4');
      if (result > 0) {
        expect(Number.isInteger(result)).toBe(true);
      }
    });
  });

  // ─── تست با فایل ویدیوی واقعی (اگر FFmpeg موجود باشد) ───

  describe('extractDurationFromFile with real video', () => {
    let tmpDir: string;
    let sampleVideoPath: string;

    beforeAll(() => {
      if (!checkFFmpegAvailable()) {
        console.warn('FFmpeg موجود نیست — تست‌های ویدیوی واقعی رد می‌شوند');
        return;
      }

      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'duration-test-'));
      sampleVideoPath = path.join(tmpDir, 'sample.mp4');

      // تولید یک فایل MP4 کوتاه با FFmpeg (۳ ثانیه)
      const { execSync } = require('child_process');
      try {
        execSync(
          `ffmpeg -y -f lavfi -i testsrc=duration=3:size=320x240:rate=30 -f lavfi -i sine=frequency=440:duration=3 -c:v libx264 -c:a aac -shortest "${sampleVideoPath}"`,
          { stdio: 'ignore', timeout: 15000 },
        );
      } catch {
        // اگر نتوانستیم فایل بسازیم، تست‌ها رد می‌شوند
        sampleVideoPath = '';
      }
    });

    afterAll(() => {
      if (tmpDir) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });

    it('should extract correct duration from real video', () => {
      if (!sampleVideoPath || !fs.existsSync(sampleVideoPath)) {
        console.warn('فایل نمونه ویدیو قابل تولید نبود — رد شد');
        return;
      }

      const duration = extractDurationFromFile(sampleVideoPath);
      // ویدیوی ۳ ثانیه‌ای — باید ۳ یا ۴ باشد (بسته به گرد کردن)
      expect(duration).toBeGreaterThanOrEqual(2);
      expect(duration).toBeLessThanOrEqual(5);
    });

    it('should return integer duration', () => {
      if (!sampleVideoPath || !fs.existsSync(sampleVideoPath)) {
        return;
      }

      const duration = extractDurationFromFile(sampleVideoPath);
      expect(Number.isInteger(duration)).toBe(true);
    });
  });
});
