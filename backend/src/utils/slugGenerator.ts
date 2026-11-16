import slugify from 'slugify';



/** حروف مجاز فارسی/عربی که در اسلاگ حفظ می‌شوند */
const PERSIAN_LETTERS =
  /[\u0621-\u064A\u0660-\u0669\u06F0-\u06F9\u067E\u0686\u0698\u06A9\u06AF\u06CC]/;

/** کاراکترهای غیرمجاز که باید حذف شوند (امنیت + خوانایی URL) */
const UNSAFE_CHARS = /[<>"'`\\/?#%&{}[\]|^~$*+=:;,!()@]/g;


const normalizePersian = (text: string): string =>
  text
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/[\u064B-\u0652\u0670]/g, '') // حذف اعراب
    .replace(/[\u200c\u200f\u200e]/g, ' ') // نیم‌فاصله و نشانه‌های جهت → فاصله
    .replace(/\s+/g, ' ')
    .trim();

/**
 * تولید اسلاگ از یک متن (نام دسته‌بندی، عنوان دوره و ...)
 */
export const generateSlug = (text: string): string => {
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

  // متن لاتین → slugify استاندارد
  return slugify(raw, {
    lower: true,
    strict: true,
    trim: true,
  });
};

/**
 * تولید اسلاگ یکتا با افزودن شمارنده در صورت تداخل
 */
export const generateUniqueSlug = async (
  text: string,
  Model: any,
  field = 'slug',
): Promise<string> => {
  const baseSlug = generateSlug(text) || `item-${Date.now()}`;
  let slug = baseSlug;
  let counter = 1;

  while (await Model.findOne({ [field]: slug })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};