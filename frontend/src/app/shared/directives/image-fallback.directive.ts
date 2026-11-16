import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnInit,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appImageFallback]',
  standalone: true,
})
export class ImageFallbackDirective implements OnInit {

  @Input('appImageFallback') fallbackType: string = 'placeholder';

  private readonly fallbackMap: Record<string, string> = {
    avatar: 'assets/images/default-avatar.svg',
    course: 'assets/images/default-course.svg',
    placeholder: 'assets/images/placeholder.svg',
  };

  private hasFallback = false;
  private isBrowser: boolean;

  constructor(
    private el: ElementRef<HTMLImageElement>,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return; // ✅ SSR-safe: در سرور هیچ کاری نکن
    // اگر تصویر اصلی خراب است (مثلاً src خالی), fallback کن
    const src = this.el.nativeElement.src;
    if (!src || src === window.location.href) {
      this.applyFallback();
    }
  }

  @HostListener('error')
  onError(): void {
    this.applyFallback();
  }

  private applyFallback(): void {
    if (this.hasFallback) return;
    this.hasFallback = true;

    const type = this.fallbackType || 'placeholder'; // اگر مقدار خالی بود، از پیش‌فرض استفاده کن
    const fallbackSrc = this.fallbackMap[type] || type;
    if (fallbackSrc) {
      this.el.nativeElement.src = fallbackSrc;
    }
  }
}
