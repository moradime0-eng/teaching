import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'toman', standalone: true, pure: true })
export class TomanPipe implements PipeTransform {
  private readonly fa = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (isNaN(num)) return '';
    const withComma = num.toLocaleString('en-US');
    const persian = withComma.replace(/\d/g, (d) => this.fa[+d]);
    return `${persian} تومان`;
  }
}