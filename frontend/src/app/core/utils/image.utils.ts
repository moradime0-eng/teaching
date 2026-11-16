/**
 * 🖼️ Image Utilities
 * ============================================================
 * ابزارهای بهینه‌سازی و نرمال‌سازی URL تصاویر
 *
 * 🎯 چرا این فایل لازم است؟
 * تصاویر آپلودشده روی Cloudinary به‌صورت خام ذخیره می‌شوند
 * (مثلاً ۲۰۰۰×۲۰۰۰ px با چند صد کیلوبایت حجم).
 * اگر همین URL مستقیم در <img> قرار بگیرد:
 *   - مرورگر باید کل فایل بزرگ را دانلود کند ← کند
 *   - لود بسیار طول می‌کشد (به‌خصوص اینترنت ایران)
 *
 * ✅ راه‌حل: تزریق transformation پویای Cloudinary
 *   .../upload/v123/avatar.jpg
 *   → .../upload/w_200,h_200,c_limit,f_auto,q_auto,g_face/avatar.jpg
 *   یعنی: resize + crop + WebP/AVIF خودکار + کیفیت هوشمند
 *
 * این کار هم حجم دانلود را ۹۰٪ کم می‌کند، هم سرعت لود را چند برابر.
 */

/** اندازهٔ پیش‌فرض برای آواتار (پیکسل) */
export const AVATAR_SIZE = 200;

/**
 * آیا URL یک تصویر Cloudinary است؟
 */
export function isCloudinaryUrl(url: string): boolean {
  return /^https?:\/\/res\.cloudinary\.com\//i.test(url);
}

/**
 * @param url       - URL اصلی تصویر
 * @param width     - عرض مطلوب (پیکسل)
 * @param height    - ارتفاع مطلوب (پیکسل)
 * @param crop      - نوع برش: `fill` (برش کامل مربعی), `limit` (کوچک‌کردن بدون برش), `pad`
 * @param gravity   - نقطهٔ تمرکز برش — `g_face` برای چهرهٔ افراد
 * @param dpr       - ضریب تراکم پیکسل (۱ یا ۲ برای صفحه‌های Retina)
 */
export function optimizeCloudinaryUrl(
  url: string,
  width: number,
  height?: number,
  crop: 'fill' | 'limit' | 'pad' | 'fit' = 'fill',
  gravity: 'face' | 'auto' | 'center' = 'face',
  dpr: 'auto' = 'auto',
): string {
  if (!url || !isCloudinaryUrl(url)) return url;

  // URL‌های Cloudinary دو فرمت دارند:
  //   ۱) /image/upload/<transformations>/<publicId>
  //   ۲) /video/upload/... یا /raw/upload/...
  const uploadMatch = url.match(
    /^https?:\/\/res\.cloudinary\.com\/([^/]+)\/([^/]+)\/upload\/(.*)$/i,
  );
  if (!uploadMatch) return url;

  const [, cloudName, resourceType, rest] = uploadMatch;

  // پیشوند نسخه (`v123/`) را جدا می‌کنیم — برای cache-busting در Cloudinary.
  // ⚠️ نکتهٔ مهم Cloudinary: پیشوند نسخه باید **بعد** از transformation بیاید،
  //    وگرنه ۴۰۴ می‌گیریم:
  //    ✅ /upload/w_240,h_240,c_fill/v123/path/file.jpg
  //    ❌ /upload/v123/w_240,h_240,c_fill/path/file.jpg
  const versionMatch = rest.match(/^(v\d+)\//);
  const version = versionMatch ? versionMatch[1] : '';
  const restWithoutVersion = versionMatch ? rest.slice(versionMatch[0].length) : rest;

  // اگر از قبل transformation دارد، آن را با جدید جایگزین می‌کنیم.
  // ⚠️ نباید فولدرِ نام‌دار (مثل `iranian-udemy/`) حذف شود وگرنه ۴۰۴ می‌گیریم.
  //    الگوی تشخیص transformation: یک بخش که فقط از کاراکترهای مجاز
  //    Cloudinary ساخته شده و بعدش هم یک بخش دیگر آمده باشد.
  const KNOWN_FOLDERS = [
    'iranian-udemy',
    'global',
    'avatars',
    'courses',
    'lectures',
    'resources',
    'thumbnails',
    'tenants',
    'uploads',
    'images',
    'public',
    'private',
  ];

  const restWithoutOldTransform = restWithoutVersion.replace(
    /^([A-Za-z0-9_-]+)\//,
    (match, segment: string, offset: number) => {
      if (KNOWN_FOLDERS.includes(segment.toLowerCase())) return match; // فولدر واقعی
      const remainder = restWithoutVersion.slice(offset + match.length);
      // فقط وقتی بعدش یک بخش دیگر هست، این را transformation فرض کن
      if (remainder.startsWith('/') && remainder.length > 1) return '';
      return match;
    },
  );

  const parts = [
    `w_${width}`,
    height ? `h_${height}` : null,
    `c_${crop}`,
    `g_${gravity}`,
    `f_auto`, // WebP/AVIF خودکار بر اساس مرورگر
    `q_auto`, // کیفیت خودکار بر اساس اندازهٔ نمایش
    `dpr_${dpr}`, // تراکم پیکسل مناسب صفحه
  ].filter(Boolean);

  const versionPart = version ? `${version}/` : '';
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${parts.join(',')}/${versionPart}${restWithoutOldTransform}`;
}

/**
 * ساخت URL بهینهٔ آواتار
 */
export function optimizeAvatarUrl(
  url: string | null | undefined,
  size: number = AVATAR_SIZE,
): string | null {
  if (!url) return null;
  return optimizeCloudinaryUrl(url, size, size, 'fill', 'face');
}

/**
 * نرمال‌سازی URL تصویر (پشتیبانی از مسیرهای محلی و relative)
 */
export function resolveImageUrl(raw: unknown, baseUrl?: string): string | null {
  if (raw == null) return null;
  let url = typeof raw === 'string' ? raw.trim() : '';
  if (!url || url === 'null' || url === 'undefined') return null;

  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('data:')) return url;

  const base = (baseUrl ?? '').replace(/\/$/, '');
  if (!base) return url;
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}
