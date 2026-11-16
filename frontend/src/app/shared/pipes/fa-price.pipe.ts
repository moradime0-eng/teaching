import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a number with Persian thousand separators (٬).
 * e.g. 643500 → "۶۴۳٬۵۰۰"
 */
@Pipe({ name: 'faPrice', standalone: true, pure: true })
export class FaPricePipe implements PipeTransform {
  private readonly fa = '۰۱۲۳۴۵۶۷۸۹';

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '';
    return value.toLocaleString('fa-IR');
  }
}
