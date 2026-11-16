import { Pipe, PipeTransform } from '@angular/core';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'sanitizeHtml',
  standalone: true,
})
export class SanitizeHtmlPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: ['b','i','em','strong','p','br','ul','ol','li','a','h1','h2','h3','h4','h5','h6','blockquote','pre','code','img','table','thead','tbody','tr','th','td','span','div','hr'],
      ALLOWED_ATTR: ['href','target','rel','src','alt','width','height','class','style'],
    });
  }
}
