import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'faNum',
  standalone: true,
  pure: true,
})
export class FaNumPipe implements PipeTransform {
  private readonly persianDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    return String(value).replace(/\d/g, (d) => this.persianDigits[+d]);
  }
}