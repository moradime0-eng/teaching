/**
 * 🎯 Campaign Text Utilities
 *
 * جلوگیری از نمایش تکراری متن کمپین در چند نقطهٔ UI.
 *
 * مسئله: در صفحهٔ دیتیل دوره، عنوان کمپین می‌توانست در ۴ جا نمایش داده شود
 * (بنر سراسری ×۲، نوار پیشنهاد، برچسب زیر قیمت) و کاربر چند بار
 * «کمپین جدید» را می‌دید. این توابع متن یکتا را محاسبه می‌کنند.
 */

/** حداقل طول متن تا نمایش داده شود (متن‌های خیلی کوتاه بی‌فایده‌اند) */
const MIN_MESSAGE_LENGTH = 4;

/** نرمال‌سازی متن برای مقایسه (حذف فاصله‌های اضافه و یکسان‌سازی ی/ي و ک/ك) */
function normalize(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[يﻯﻰ]/g, 'ی')
    .replace(/[كﻙ]/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .toLowerCase();
}

/**
 * آیا دو متن عملاً یکسان هستند؟
 */
export function isSameText(a: unknown, b: unknown): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * پیام بنر را فقط وقتی برگردان که با عنوان کمپین فرق دارد.
 *
 * در غیر این صورت `null` برمی‌گردد تا template بتواند
 * عنصر تکراری را اصلاً رندر نکند.
 */
export function distinctBannerMessage(
  title: unknown,
  bannerText: unknown
): string | null {
  const text = typeof bannerText === 'string' ? bannerText.trim() : '';
  if (!text) return null;
  if (text.length < MIN_MESSAGE_LENGTH) return null;
  if (isSameText(text, title)) return null;
  return text;
}

/**
 * متن یکتای کمپین برای نمایش در کارت/بنرهای کوچک.
 *
 * اگر عنوان خالی باشد، از `bannerText` استفاده می‌شود.
 */
export function campaignTitle(campaign: { title?: string; bannerText?: string } | null | undefined): string {
  if (!campaign) return '';
  const title = typeof campaign.title === 'string' ? campaign.title.trim() : '';
  if (title) return title;
  const text = typeof campaign.bannerText === 'string' ? campaign.bannerText.trim() : '';
  return text;
}

/**
 * آیا متن کمپین باید در کارت دوره نمایش داده شود؟
 *
 * اگر متن کمپین صرفاً یک عدد/درصد باشد (مثل «۱۰٪ تخفیف»)، نمایش آن
 * به‌عنوان «کمپین ۱۰٪» تکراری و بی‌معناست → false.
 */
export function isMeaningfulCampaignLabel(text: unknown): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (t.length < MIN_MESSAGE_LENGTH) return false;
  // فقط عدد/درصد/علامت است → بی‌فایده
  if (/^[\d۰-۹.,\s%٪+\-–—]+$/.test(t)) return false;
  return true;
}
