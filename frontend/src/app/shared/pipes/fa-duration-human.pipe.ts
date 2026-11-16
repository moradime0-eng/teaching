import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts minutes to Persian human-readable duration.
 * e.g. 205 → "۳ ساعت و ۲۵ دقیقه"
 */
@Pipe({ name: 'faDurationHuman', standalone: true, pure: true })
export class FaDurationHumanPipe implements PipeTransform {
  private readonly fa = '۰۱۲۳۴۵۶۷۸۹';

  private toFa(n: number): string {
    return String(n).replace(/\d/g, (d) => this.fa[+d]);
  }

  transform(minutes: number | null | undefined): string {
    if (!minutes || minutes <= 0) return '۰ دقیقه';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h && m) return `${this.toFa(h)} ساعت و ${this.toFa(m)} دقیقه`;
    if (h) return `${this.toFa(h)} ساعت`;
    return `${this.toFa(m)} دقیقه`;
  }
}
