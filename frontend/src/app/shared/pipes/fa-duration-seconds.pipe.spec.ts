import { FaDurationSecondsPipe } from './fa-duration-seconds.pipe';

describe('FaDurationSecondsPipe', () => {
  let pipe: FaDurationSecondsPipe;

  beforeEach(() => {
    pipe = new FaDurationSecondsPipe();
  });

  it('should return zero for empty/negative values', () => {
    expect(pipe.transform(null)).toBe('۰ ثانیه');
    expect(pipe.transform(undefined)).toBe('۰ ثانیه');
    expect(pipe.transform(0)).toBe('۰ ثانیه');
    expect(pipe.transform(-100)).toBe('۰ ثانیه');
  });

  it('should format seconds under a minute', () => {
    expect(pipe.transform(1)).toBe('۱ ثانیه');
    expect(pipe.transform(30)).toBe('۳۰ ثانیه');
    expect(pipe.transform(59)).toBe('۵۹ ثانیه');
  });

  it('should format minutes', () => {
    expect(pipe.transform(60)).toBe('۱ دقیقه');
    expect(pipe.transform(90)).toBe('۱ دقیقه و ۳۰ ثانیه');
    expect(pipe.transform(360)).toBe('۶ دقیقه');
  });

  it('should format hours without noisy trailing units', () => {
    expect(pipe.transform(3600)).toBe('۱ ساعت');
    expect(pipe.transform(7200)).toBe('۲ ساعت');
    expect(pipe.transform(36000)).toBe('۱۰ ساعت');
  });

  it('should format mixed hours, minutes and seconds', () => {
    expect(pipe.transform(3661)).toBe('۱ ساعت و ۱ دقیقه و ۱ ثانیه');
    expect(pipe.transform(7325)).toBe('۲ ساعت و ۲ دقیقه و ۵ ثانیه');
  });

  it('should sum durations correctly (regression for the reported bug)', () => {
    // چند ویدیو که با هم جمع می‌شوند: 30s + 90s + 1800s = 1920s = 32 دقیقه
    const lectures = [30, 90, 1800];
    const total = lectures.reduce((sum, d) => sum + d, 0);
    expect(total).toBe(1920);
    expect(pipe.transform(total)).toBe('۳۲ دقیقه');
  });

  it('should NOT treat minutes as hours (the original bug)', () => {
    // یک ویدیوی ۳۰ ثانیه‌ای نباید «۱ ساعت» نمایش داده شود
    expect(pipe.transform(30)).not.toContain('ساعت');
    // یک دوره‌ی ۱۰ ساعته (۳۶۰۰۰ ثانیه) نباید «۶۰۰ ساعت» شود
    expect(pipe.transform(36000)).toBe('۱۰ ساعت');
  });
});
