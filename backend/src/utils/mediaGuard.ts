/**
 * 🔒 محافظت از لینک‌های خام رسانه (Anti-Leak)
 *
 * مسئله: فیلدهای `videoUrl` / `fileUrl` در مدل Lecture حاوی لینک **عمومی و
 * دائمی** سرویس ذخیره‌سازی (Arvan/S3) هستند. اگر این لینک‌ها در پاسخ API
 * عمومی (مثل `GET /courses/:id`) برگردند، هر کاربری می‌تواند:
 *   ۱. ویدیو را مستقیم دانلود کند (بدون ثبت‌نام)
 *   ۲. با کپی لینک، محتوای پولی را دور بزند
 *
 * راه‌حل: در پاسخ‌های عمومی، لینک خام با یک URL داخلیِ محافظت‌شده جایگزین
 * می‌شود که از `assertContentAccess` عبور می‌کند.
 */

/**
 * دامنه‌های ذخیره‌سازی که لینکشان «خام/عمومی» است و باید حذف شود
 * ⚠️ فقط برای **ویدیو/فایل** — نه تصویر!
 * تصاویر (آواتار/بندانگشتی) روی Cloudinary/Arvan هستند و باید نمایش داده شوند.
 */
const RAW_STORAGE_PATTERNS: RegExp[] = [
  /s3\.ir-thr-at1\.arvanstorage\.ir/i,
  /s3\.[a-z0-9-]+\.amazonaws\.com/i,
  /storage\.googleapis\.com/i,
  /backblazeb2\.com/i,
  /r2\.cloudflarestorage\.com/i,
  /minio/i,
];

/** لینک‌های عمومی embed (YouTube/Aparat/Vimeo) — مجاز */
const PUBLIC_EMBED_PATTERN =
  /(youtube\.com|youtu\.be|aparat\.com|aparat\.ir|vimeo\.com|dailymotion\.com)/i;

/**
 * آیا این لینک یک تصویر عمومی است (قابل نمایش)؟
 * - Cloudinary با resourceType = `image`
 * - لینک محلی (`/uploads/...`)
 */
export function isPublicImageUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  if (/res\.cloudinary\.com\//i.test(u)) {
    return /\/image\/upload\//i.test(u) || /\/raw\/upload\//i.test(u);
  }
  return false;
}

/**
 * آیا این لینک یک لینک خامِ ذخیره‌سازی است (باید محافظت شود)؟
 *
 * ⚠️ نکته مهم: Cloudinary هم تصویر دارد و هم ویدیو/فایل.
 *    بنابراین بر اساس **نوع resource** تفکیک می‌کنیم، نه صرفاً دامنه.
 *    اگر `cloudinary.com` در فهرست کلی بیاید، آواتار و بندانگشتی هم
 *    از کار می‌افتند (تصویر نمایش داده نمی‌شود).
 */
export function isRawStorageUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();

  // embed عمومی → مجاز
  if (PUBLIC_EMBED_PATTERN.test(u)) return false;
  // تصویر عمومی → مجاز
  if (isPublicImageUrl(u)) return false;

  if (RAW_STORAGE_PATTERNS.some((re) => re.test(u))) return true;

  // Cloudinary با resourceType = video → محافظت شود
  if (/res\.cloudinary\.com\//i.test(u) && /\/video\/upload\//i.test(u)) return true;

  return false;
}

/**
 * آیا این لینک یک embed عمومی است (YouTube / Aparat / Vimeo)؟
 * این‌ها «پیش‌نمایش عمومی» هستند و برای معرفی دوره مجازند.
 */
export function isPublicEmbedUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  return /(youtube\.com|youtu\.be|aparat\.com|vimeo\.com|dailymotion\.com|aparat\.ir)/i.test(url);
}

/**
 * 🔒 حذف لینک‌های خام از یک «آیتم محتوا» (contentItems) — سیستم جدید
 *
 * ⚠️ باگ امنیتی: `sanitizeLectureMedia` فقط فیلدهای قدیمی درس را پاک می‌کرد و
 * `contentItems` (ویدیو/فایل/تصویر/صوت سیستم جدید) دست‌نخورده باقی می‌ماند؛
 * در نتیجه لینک خام S3/Arvan و `storage.key` در پاسخ عمومی دوره لو می‌رفت و
 * هر کاربری می‌توانست محتوای پولی را مستقیم دانلود کند.
 *
 * فیلدهایی که حذف/ماسک می‌شوند:
 *   videoUrl, fileUrl, imageUrl, audioUrl, storage.key,
 *   processing.hls.masterPlaylist
 *
 * @param item  آیتم محتوا (lean یا subdocument)
 * @returns     نسخهٔ پاک‌سازی‌شده (بدون mutate کردن ورودی)
 */
export function sanitizeContentItem(item: any): any {
  if (!item || typeof item !== 'object') return item;

  const clone: any = { ...item };

  // لینک‌های خام رسانه (تصاویر عمومی Cloudinary و embedهای عمومی حفظ می‌شوند)
  for (const field of ['videoUrl', 'fileUrl', 'imageUrl', 'audioUrl', 'url', 'filePath', 'contentUrl']) {
    if (isRawStorageUrl(clone[field])) delete clone[field];
  }

  // کلید ذخیره‌سازی (با آن می‌توان لینک مستقیم ساخت)
  if (clone.storage && typeof clone.storage === 'object' && clone.storage.key) {
    clone.storage = { ...clone.storage, key: undefined };
    delete clone.storage.key;
  }

  // HLS master playlist
  if (clone.processing?.hls?.masterPlaylist) {
    if (isRawStorageUrl(clone.processing.hls.masterPlaylist)) {
      clone.processing = {
        ...clone.processing,
        hls: { ...clone.processing.hls, masterPlaylist: undefined },
      };
      delete clone.processing.hls.masterPlaylist;
    }
    if (Array.isArray(clone.processing.hls.qualities)) {
      clone.processing.hls.qualities = clone.processing.hls.qualities.filter(
        (q: string) => !isRawStorageUrl(q),
      );
    }
  }

  return clone;
}

/**
 * 🔒 حذف لینک‌های خام از یک شیء درس (به‌صورت shallow-safe)
 *
 * فیلدهایی که حذف/ماسک می‌شوند:
 *   videoUrl, fileUrl, url, filePath, contentUrl,
 *   videoQualities[].url, storage.key, processing.hls.masterPlaylist,
 *   contentItems[].{videoUrl,fileUrl,imageUrl,audioUrl,storage.key}
 *
 * @param lecture  سند درس (lean یا سند معمولی)
 * @returns        نسخهٔ پاک‌سازی‌شده (بدون mutate کردن ورودی)
 */
export function sanitizeLectureMedia(lecture: any): any {
  if (!lecture || typeof lecture !== 'object') return lecture;

  const clone: any = { ...lecture };

  // لینک‌های خام اصلی
  for (const field of ['videoUrl', 'fileUrl', 'url', 'filePath', 'contentUrl']) {
    if (isRawStorageUrl(clone[field])) delete clone[field];
  }

  // 🔒 آیتم‌های محتوا (سیستم جدید) — ویدیو/فایل/تصویر/صوت
  if (Array.isArray(clone.contentItems)) {
    clone.contentItems = clone.contentItems.map((item: any) => sanitizeContentItem(item));
  }

  // کیفیت‌های ویدیو (می‌توانند لینک خام داشته باشند)
  if (Array.isArray(clone.videoQualities)) {
    clone.videoQualities = clone.videoQualities
      .map((q: any) => (isRawStorageUrl(q?.url) ? { ...q, url: undefined } : q))
      .filter((q: any) => q?.url);
  }

  // کلید ذخیره‌سازی (با آن می‌توان لینک مستقیم ساخت)
  if (clone.storage && typeof clone.storage === 'object') {
    if (clone.storage.key) {
      clone.storage = { ...clone.storage, key: undefined };
      delete clone.storage.key;
    }
  }

  // HLS master playlist
  if (clone.processing?.hls?.masterPlaylist) {
    if (isRawStorageUrl(clone.processing.hls.masterPlaylist)) {
      clone.processing = {
        ...clone.processing,
        hls: { ...clone.processing.hls, masterPlaylist: undefined },
      };
      delete clone.processing.hls.masterPlaylist;
    }
    if (Array.isArray(clone.processing.hls.qualities)) {
      clone.processing.hls.qualities = clone.processing.hls.qualities.filter(
        (q: string) => !isRawStorageUrl(q),
      );
    }
  }

  // منابع (resources) — ممکن است لینک خام داشته باشند
  if (Array.isArray(clone.resources)) {
    clone.resources = clone.resources.map((r: any) =>
      isRawStorageUrl(r?.url) ? { ...r, url: '' } : r,
    );
  }

  return clone;
}

/**
 * 🔒 پاک‌سازی لیست درس‌های یک دوره
 */
export function sanitizeCourseSections(sections: any[]): any[] {
  if (!Array.isArray(sections)) return sections;
  return sections.map((sec: any) => {
    if (!sec || !Array.isArray(sec.lectures)) return sec;
    return {
      ...sec,
      lectures: sec.lectures.map((lec: any) => sanitizeLectureMedia(lec)),
    };
  });
}

/**
 * 🔒 پاک‌سازی فیلدهای رسانهٔ خودِ دوره (ویدیوی معرفی و ...)
 *
 * `promoVideo` / `promoVideoUrl` در مدل Course هم لینک خام Arvan/S3 هستند و
 * در پاسخ `GET /courses` و `GET /courses/:id` عمومی برمی‌گردند.
 * ویدیوی معرفی از طریق `GET /upload/stream/:courseId` قابل پخش است،
 * پس لینک خام آن اصلاً لازم نیست.
 *
 * لینک‌های embed عمومی (YouTube/Aparat/Vimeo) دست‌نخورده باقی می‌مانند.
 *
 * @param allowRaw  اگر true باشد لینک خام حفظ می‌شود — فقط برای مالک دوره
 *                  و ادمین (ویرایشگر دوره به پیش‌نمایش ویدیو نیاز دارد).
 */
export function sanitizeCourseMedia(course: any, allowRaw = false): any {
  if (!course || typeof course !== 'object') return course;

  const clone: any = { ...course };

  // ⚠️ promoVideoKey یک «کلید ذخیره‌سازی» است نه URL — با آن می‌توان لینک مستقیم ساخت
  const hadRawPromo =
    isRawStorageUrl(clone.promoVideo) ||
    isRawStorageUrl(clone.promoVideoUrl) ||
    !!clone.promoVideoKey ||
    !!clone.promoVideoStorage?.key;

  if (hadRawPromo) {
    // 🔒 به فرانت‌اند اعلام می‌کنیم ویدیو آپلودشده است → از مسیر محافظت‌شده پخش شود
    clone.promoVideoProtected = true;
  }

  if (!allowRaw) {
    // 🔒 لینک خام + کلید ذخیره‌سازی (با کلید می‌توان لینک مستقیم ساخت)
    for (const field of ['promoVideo', 'promoVideoUrl', 'trailerUrl']) {
      if (isRawStorageUrl(clone[field])) {
        delete clone[field];
      }
    }
    if (clone.promoVideoKey) {
      delete clone.promoVideoKey;
    }
    if (clone.promoVideoStorage?.key) {
      clone.promoVideoStorage = { ...clone.promoVideoStorage, key: undefined };
      delete clone.promoVideoStorage.key;
    }
  }

  return clone;
}
