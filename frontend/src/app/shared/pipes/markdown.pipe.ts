import { Pipe, PipeTransform, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    // ۱. تبدیل مارک‌داون به HTML
    const rawHtml = marked.parse(value, { async: false }) as string;

    // ۲. اگر در محیط مرورگر هستیم، آن را با DOMPurify امن می‌کنیم
    let cleanHtml = rawHtml;
    if (isPlatformBrowser(this.platformId)) {
      cleanHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a', 
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 
          'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div', 
          'hr', 'del', 'ins', 'sub', 'sup', 'mark', 'small'
        ],
        ALLOWED_ATTR: [
          'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 
          'class', 'style', 'id', 'name'
        ],
      });
    }

    // ۳. مجوز دادن به انگولار برای رندر بدون هشدار
    return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
  }
}