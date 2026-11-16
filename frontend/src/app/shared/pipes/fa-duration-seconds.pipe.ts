import { Pipe, PipeTransform } from '@angular/core';

/**
 * ⚠️ نمایش مدت‌زمان بر حسب «ثانیه» به‌صورت خوانا و فارسی.
 *
 * ریشه‌ی باگ قبلی: در چند نقطه از پروژه، مقدار `totalDuration` (که بر حسب
 * **ثانیه** است) مستقیماً تقسیم بر ۶۰ می‌شد و برچسب «ساعت» می‌خورد:
 *
 *   Math.round(sec / 60)  // ← این دقیقه است، نه ساعت!
 *
 * نتیجه: ویدیوی ۳۰ ثانیه‌ای «۱ ساعت» نمایش داده می‌شد و یک دوره‌ی
 * ۱۰ ساعته (۳۶۰۰۰ ثانیه) «۶۰۰ ساعت» نشان داده می‌شد.
 *
 * این pipe واحد را صریحاً از نام خود می‌گیرد تا اشتباه نشود.
 *
 * نمونه:
 *   30    → «۳۰ ثانیه»
 *   90    → «۱ دقیقه و ۳۰ ثانیه»
 *   3600  → «۱ ساعت»
 *   3661  → «۱ ساعت و ۱ دقیقه»
 *   36000 → «۱۰ ساعت»
 */
@Pipe({ name: 'faDurationSeconds', standalone: true, pure: true })
export class FaDurationSecondsPipe implements PipeTransform {
  private readonly fa = '۰۱۲۳۴۵۶۷۸۹';

  private toFa(n: number | string): string {
    return String(n).replace(/\d/g, (d) => this.fa[+d]);
  }

  transform(seconds: number | null | undefined): string {
    const total = Math.floor(Number(seconds) || 0);
    if (total <= 0) return '۰ ثانیه';

    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    const parts: string[] = [];

    if (h > 0) parts.push(`${this.toFa(h)} ساعت`);
    // فقط وقتی دقیقه معنادار است نمایش داده می‌شود (وگرنه «۱ ساعت و ۰ دقیقه» زشت است)
    if (m > 0) parts.push(`${this.toFa(m)} دقیقه`);
    if (s > 0) parts.push(`${this.toFa(s)} ثانیه`);

    return parts.length ? parts.join(' و ') : `${this.toFa(h || 0)} ساعت`;
  }
}
