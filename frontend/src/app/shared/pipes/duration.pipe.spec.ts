/**
 * 🧪 DurationPipe Tests
 *
 * تست‌های لوله تبدیل ثانیه به فرمت زمان فارسی
 */

import { DurationPipe } from './duration.pipe';

describe('DurationPipe', () => {
  let pipe: DurationPipe;

  beforeEach(() => {
    pipe = new DurationPipe();
  });

  // ─── تست‌های پایه ───

  it('should create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  // ─── تست مقادیر صفر و null ───

  it('should return ۰۰:۰۰ for 0 seconds', () => {
    expect(pipe.transform(0)).toBe('۰۰:۰۰');
  });

  it('should return ۰۰:۰۰ for null', () => {
    expect(pipe.transform(null)).toBe('۰۰:۰۰');
  });

  it('should return ۰۰:۰۰ for undefined', () => {
    expect(pipe.transform(undefined)).toBe('۰۰:۰۰');
  });

  it('should return ۰۰:۰۰ for negative values', () => {
    expect(pipe.transform(-10)).toBe('۰۰:۰۰');
  });

  // ─── تست فرمت ثانیه (MM:SS) ───

  it('should format 5 seconds as ۰۰:۰۵', () => {
    expect(pipe.transform(5)).toBe('۰۰:۰۵');
  });

  it('should format 30 seconds as ۰۰:۳۰', () => {
    expect(pipe.transform(30)).toBe('۰۰:۳۰');
  });

  it('should format 59 seconds as ۰۰:۵۹', () => {
    expect(pipe.transform(59)).toBe('۰۰:۵۹');
  });

  // ─── تست فرمت دقیقه (MM:SS) ───

  it('should format 60 seconds as ۰۱:۰۰', () => {
    expect(pipe.transform(60)).toBe('۰۱:۰۰');
  });

  it('should format 65 seconds as ۰۱:۰۵', () => {
    expect(pipe.transform(65)).toBe('۰۱:۰۵');
  });

  it('should format 599 seconds as ۰۹:۵۹', () => {
    expect(pipe.transform(599)).toBe('۰۹:۵۹');
  });

  // ─── تست فرمت ساعت (H:MM:SS) ───

  it('should format 3600 seconds as ۱:۰۰:۰۰', () => {
    expect(pipe.transform(3600)).toBe('۱:۰۰:۰۰');
  });

  it('should format 3661 seconds as ۱:۰۱:۰۱', () => {
    expect(pipe.transform(3661)).toBe('۱:۰۱:۰۱');
  });

  it('should format 1355 seconds as ۲۲:۳۵', () => {
    expect(pipe.transform(1355)).toBe('۲۲:۳۵');
  });

  it('should format 7200 seconds as ۲:۰۰:۰۰', () => {
    expect(pipe.transform(7200)).toBe('۲:۰۰:۰۰');
  });

  it('should format 36661 seconds as ۱۰:۱۱:۰۱', () => {
    expect(pipe.transform(36661)).toBe('۱۰:۱۱:۰۱');
  });

  // ─── تست عددی ───

  it('should handle float values by flooring', () => {
    expect(pipe.transform(65.7)).toBe('۰۱:۰۵');
  });

  it('should handle large values', () => {
    expect(pipe.transform(86399)).toBe('۲۳:۵۹:۵۹');
  });

  // ─── تست اعداد فارسی ───

  it('should use Persian/Arabic numerals', () => {
    const result = pipe.transform(3723);
    // 3723 = 1:02:03 → should contain فارسی digits
    expect(result).toContain('۱');
    expect(result).toContain('۰');
    expect(result).toContain('۲');
    expect(result).toContain('۳');
  });
});
