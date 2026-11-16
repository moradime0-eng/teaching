/**
 * 🔒 Media URL Guard (Frontend)
 * ============================================================
 * تشخیص «لینک خامِ ذخیره‌سازی» که نباید مستقیم به مرورگر داده شود.
 *
 * 🎯 تفکیک کلیدی:
 *   - **تصویر** (آواتار، بندانگشتی، تصویر درس) → لینک عمومی است و باید
 *     نمایش داده شود. (Cloudinary / Arvan image)
 *   - **ویدیو / فایل** (محتوای دوره) → باید فقط از مسیر محافظت‌شدهٔ
 *     بک‌اند (`/upload/stream/:id` یا `/upload/file/:id`) خوانده شود.
 *
 * ⚠️ اشتباه رایج: گذاشتن `cloudinary.com` در فهرست لینک‌های ممنوع.
 *    Cloudinary هم آواتار/بندانگشتی دارد (تصویر) و هم ویدیو (محتوا).
 *    باید بر اساس **نوع resource** تفکیک کرد، نه دامنه.
 */

/**
 * الگوهای لینک خام ذخیره‌سازی که **فقط برای ویدیو/فایل** ممنوع هستند.
 * (Arvan / S3 / R2 / Backblaze / MinIO / Google Storage)
 */
const RAW_MEDIA_HOSTS =
  /s3\.ir-thr-at1\.arvanstorage\.ir|s3\.[a-z0-9-]+\.amazonaws\.com|storage\.googleapis\.com|backblazeb2\.com|r2\.cloudflarestorage\.com/i;

/**
 * لینک‌های عمومی embed (YouTube/Aparat/Vimeo) — مجاز.
 */
const PUBLIC_EMBED = /(youtube\.com|youtu\.be|aparat\.com|aparat\.ir|vimeo\.com|dailymotion\.com)/i;

/**
 * آیا این لینک یک تصویر عمومی است (قابل نمایش مستقیم)؟
 * - Cloudinary با resourceType = `image`
 * - لینک‌های محلی (`/uploads/...`, `/assets/...`)
 * - data: URL
 */
export function isPublicImageUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  if (u.startsWith('data:image/')) return true;
  // Cloudinary → فقط بخش image (ویدیو/فایلش محافظت می‌شود)
  if (/res\.cloudinary\.com\//i.test(u)) {
    return /\/image\/upload\//i.test(u) || /\/raw\/upload\//i.test(u);
  }
  return false;
}

/**
 * 🔒 آیا این لینک یک لینک خامِ ویدیو/فایلِ محافظت‌شده است؟
 * (باید به مسیر بک‌اند تبدیل شود، نه اینکه مستقیم به مرورگر داده شود)
 */
export function isRawMediaUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  if (PUBLIC_EMBED.test(u)) return false; // embed عمومی مجاز
  if (isPublicImageUrl(u)) return false; // تصویر عمومی مجاز
  if (RAW_MEDIA_HOSTS.test(u)) return true;
  // Cloudinary با resourceType = video → محافظت شود
  if (/res\.cloudinary\.com\//i.test(u) && /\/video\/upload\//i.test(u)) return true;
  return false;
}

/**
 * آیا این لینک یک embed عمومی است؟
 */
export function isEmbedUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  return PUBLIC_EMBED.test(url);
}
