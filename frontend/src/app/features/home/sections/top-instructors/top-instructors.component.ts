import { Component, OnInit, inject, signal, PLATFORM_ID, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { InstructorService, TopInstructor } from '../../../../core/services/instructor.service';
import { TiltGlareDirective } from '../../../../shared/directives/tilt-glare.directive';
import { environment } from '../../../../../environments/environment.development';
import { optimizeAvatarUrl, resolveImageUrl } from '../../../../core/utils/image.utils';

@Component({
  selector: 'app-top-instructors',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule, TiltGlareDirective],
  templateUrl: './top-instructors.component.html',
  styleUrl: './top-instructors.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TopInstructorsComponent implements OnInit {
  private instructorService = inject(InstructorService);
  private platformId = inject(PLATFORM_ID);

  isLoading = signal(true);
  instructors = signal<TopInstructor[]>([]);
  brokenImages = signal<Record<string, boolean>>({});
  /** 🆕 وضعیت لود هر تصویر — تا بتوان placeholder و fade-in نمایش داد */
  loadedImages = signal<Record<string, boolean>>({});
  skeletonItems = Array(6).fill(0);

  ngOnInit(): void {
    this.loadTopInstructors();
  }

  private loadTopInstructors(): void {
    this.isLoading.set(true);
    this.instructorService.getTopInstructors(6).subscribe({
      next: (res) => {
        this.instructors.set(res.data ?? []);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  /**
   * 🖼️ ساخت URL آواتار
   * - مسیرهای محلی → با base سرور ترکیب می‌شوند
   * - تصاویر Cloudinary → با transformation بهینه می‌شوند
   *   (resize + crop چهره + WebP/AVIF + کیفیت خودکار)
   *   ← حجم دانلود ۹۰٪ کم و لود چند برابر سریع‌تر
   */
  resolveImageUrl(raw: unknown): string | null {
    const base = environment?.socketUrl?.replace(/\/$/, '') || '';
    const full = resolveImageUrl(raw, base);
    if (!full) return null;
    return optimizeAvatarUrl(full, 240);
  }

  shouldShowImage(key: string, rawUrl: unknown): boolean {
    const fullUrl = this.resolveImageUrl(rawUrl);
    return !!fullUrl && !this.brokenImages()[key];
  }

  /** 🆕 آیا تصویر هنوز لود نشده؟ (برای نمایش shimmer) */
  isImageLoading(key: string): boolean {
    return !this.loadedImages()[key] && !this.brokenImages()[key];
  }

  onImageLoad(key: string): void {
    this.loadedImages.update((m) => ({ ...m, [key]: true }));
  }

  onImageError(key: string, event: Event): void {
    this.brokenImages.update((m) => ({ ...m, [key]: true }));
    this.loadedImages.update((m) => ({ ...m, [key]: true }));
    const img = event.target as HTMLImageElement | null;
    if (img) img.onerror = null;
  }

  faNum(n?: number): string {
    return (n ?? 0).toLocaleString('fa-IR');
  }

  /** حذف تگ‌های HTML — امن برای SSR (بدون نیاز به DOM) */
  plainText(html: string | null | undefined): string {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // حذف بلاک استایل
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // حذف بلاک اسکریپت
      .replace(/<br\s*\/?>/gi, ' ') // <br> → فاصله
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ') // پایان بلاک → فاصله
      .replace(/<[^>]+>/g, '') // حذف بقیه تگ‌ها
      .replace(/&nbsp;/g, ' ')
      .replace(/&zwnj;/g, '\u200c') // نیم‌فاصله فارسی
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, ' ') // بقیه entityها
      .replace(/\s+/g, ' ') // فاصله‌های تکراری
      .trim();
  }

  initials(name: string): string {
    const parts = (name || '').split(' ');
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }
}
