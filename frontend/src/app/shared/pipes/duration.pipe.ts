import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'duration', standalone: true, pure: true })
export class DurationPipe implements PipeTransform {
  private readonly fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  private toFa(s: string | number): string {
    return String(s).replace(/\d/g, (d) => this.fa[+d]);
  }

  transform(seconds: number | null | undefined): string {
    if (!seconds || seconds < 0) return this.toFa('۰۰:۰۰');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return this.toFa(`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }
    return this.toFa(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
  }
}