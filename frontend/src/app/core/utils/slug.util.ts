/**
 * 🧩 تولید اسلاگ در سمت کلاینت (هم‌راستا با بک‌اند)
 * ============================================================
 * - برای متن لاتین: حروف کوچک، فاصله → خط تیره، حذف کاراکترهای غیرمجاز
 * - برای متن فارسی/عربی: خودِ متن نرمال‌شده حفظ می‌شود (URL خوانا و بدون تداخل)
 * - نیم‌فاصله و فاصله‌های تکراری → یک خط تیره
 * ============================================================
 */

const PERSIAN_LETTERS =
  /[\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\u067E\u0686\u0698\u06A9\u06AF\u06CC]/;

const UNSAFE_CHARS = /[<>"'`\\/?#%&{}[\]|^~$*+=:;,!()@]/g;

const normalizePersian = (text: string): string =>
  text
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/[\u064B-\u0652\u0670]/g, '') // حذف اعراب
    .replace(/[\u200c\u200f\u200e]/g, ' ') // نیم‌فاصله → فاصله
    .replace(/\s+/g, ' ')
    .trim();

export function generateSlug(text: string): string {
  const raw = (text ?? '').toString().trim();
  if (!raw) return '';

  const hasPersian = PERSIAN_LETTERS.test(raw);

  if (hasPersian) {
    return normalizePersian(raw)
      .replace(UNSAFE_CHARS, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  return raw
    .toLowerCase()
    .replace(UNSAFE_CHARS, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
