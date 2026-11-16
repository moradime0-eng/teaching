import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'faRating', standalone: true, pure: true })
export class FaRatingPipe implements PipeTransform {
  private readonly fa = '۰۱۲۳۴۵۶۷۸۹';

  transform(value: number): string {
    if (value === null || value === undefined || isNaN(value)) return '۰٫۰';
    return value
      .toFixed(1)
      .replace('.', '٫')
      .replace(/\d/g, (d) => this.fa[+d]);
  }
}
