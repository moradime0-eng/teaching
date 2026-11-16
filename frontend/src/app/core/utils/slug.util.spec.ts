import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('should produce a readable Persian slug (not transliterated gibberish)', () => {
    expect(generateSlug('برنامه نویسی')).toBe('برنامه-نویسی');
  });

  it('should convert ZWNJ (نیم‌فاصله) to a hyphen', () => {
    expect(generateSlug('هوش\u200cمصنوعی')).toBe('هوش-مصنوعی');
  });

  it('should collapse multiple spaces into a single hyphen', () => {
    expect(generateSlug('طراحی    گرافیک')).toBe('طراحی-گرافیک');
  });

  it('should produce distinct slugs for distinct Persian names', () => {
    const a = generateSlug('برنامه نویسی');
    const b = generateSlug('طراحی گرافیک');
    expect(a).not.toBe(b);
  });

  it('should slugify latin text', () => {
    expect(generateSlug('Web Development')).toBe('web-development');
  });

  it('should strip unsafe characters', () => {
    expect(generateSlug('a<b>c/d')).toBe('abcd');
  });

  it('should return an empty string for empty input', () => {
    expect(generateSlug('')).toBe('');
    expect(generateSlug('   ')).toBe('');
  });

  it('should normalize Arabic Yeh/Kaf to Persian', () => {
    // ي عربی → ی فارسی ، ك عربی → ک فارسی
    expect(generateSlug('كتاب ي')).toBe('کتاب-ی');
  });
});
