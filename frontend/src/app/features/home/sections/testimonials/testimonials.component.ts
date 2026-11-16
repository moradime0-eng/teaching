import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ReviewService } from '../../../../core/services/review.service';
import { TiltGlareDirective } from '../../../../shared/directives/tilt-glare.directive';
import { RatingStarsComponent } from '../../../../shared/components/rating-stars/rating-stars.component';
import { environment } from '../../../../../environments/environment.development';
import { optimizeAvatarUrl, resolveImageUrl } from '../../../../core/utils/image.utils';

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule, MatIconModule, TiltGlareDirective, RatingStarsComponent],
  templateUrl: './testimonials.component.html',
  styleUrl: './testimonials.component.scss',
})
export class TestimonialsComponent implements OnInit {
  private reviewService = inject(ReviewService);
  private platformId = inject(PLATFORM_ID);
  private sanitizer = inject(DomSanitizer);

  isLoading = signal(true);
  reviews = signal<any[]>([]);
  brokenImages = signal<Record<string, boolean>>({});
  expandedIds = signal<Set<string>>(new Set());
  skeletonItems = Array(4).fill(0);
  private readonly EXPAND_THRESHOLD = 100;

  ngOnInit(): void {
    this.loadTopReviews();
  }

  private loadTopReviews(): void {
    this.isLoading.set(true);
    this.reviewService.getTopReviews(6).subscribe({
      next: (res) => {
        this.reviews.set((res as any).data || []);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  /**
   * 🖼️ ساخت URL آواتار
   * تصاویر Cloudinary با transformation بهینه می‌شوند (resize + WebP/AVIF)
   */
  resolveImageUrl(raw: unknown): string | null {
    const base = environment?.socketUrl?.replace(/\/$/, '') || '';
    const full = resolveImageUrl(raw, base);
    if (!full) return null;
    return optimizeAvatarUrl(full, 160);
  }

  shouldShowImage(key: string, rawUrl: unknown): boolean {
    const fullUrl = this.resolveImageUrl(rawUrl);
    // 🐛 FIX: شرط قبلی برعکس بود (`!fullUrl`) → تصویر هرگز نمایش داده نمی‌شد
    return !!fullUrl && !this.brokenImages()[key];
  }

  onImageError(key: string, event: Event): void {
    this.brokenImages.update((m) => ({ ...m, [key]: true }));
    const img = event.target as HTMLImageElement | null;
    if (img) img.onerror = null;
  }

  userName(review: any): string {
    return review.user?.fullName || review.user?.name || 'دانشجو';
  }

  userAvatar(review: any): string {
    return review.user?.avatar || '';
  }

  courseTitle(review: any): string {
    return review.course?.title || 'دوره آموزشی';
  }

  reviewRating(review: any): number {
    const r = Number(review?.rating);
    return isNaN(r) ? 0 : r;
  }

  // ⭐ متد اصلاح شده با DomSanitizer استاندارد انگولار
  safeHtml(html: string): SafeHtml {
    if (!html) return '';
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  plainText(html: string): string {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&zwnj;/g, '\u200c')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  shouldShowExpand(review: any): boolean {
    const text = this.plainText(review.comment || '');
    return text.length > this.EXPAND_THRESHOLD;
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  toggleExpand(id: string): void {
    this.expandedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  scrollLeft(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.querySelector('.testi-scroll__track');
    if (el) el.scrollBy({ left: 340, behavior: 'smooth' });
  }

  scrollRight(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.querySelector('.testi-scroll__track');
    if (el) el.scrollBy({ left: -340, behavior: 'smooth' });
  }

  /**
   * Truncates HTML content to a specified number of lines
   * This is needed because -webkit-line-clamp doesn't work reliably with innerHTML
   */
  truncateHtml(html: string, maxLines: number): string {
    if (!html) return '';
    
    // During SSR, document is not available - return original HTML
    if (!isPlatformBrowser(this.platformId)) {
      return html;
    }
    
    // Create a temporary element to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get text content and split into words
    const text = tempDiv.textContent || tempDiv.innerText || '';
    const words = text.trim().split(/\s+/);
    
    // Estimate words per line (roughly 12-15 words per line for Persian text)
    const wordsPerLine = 12;
    const maxWords = maxLines * wordsPerLine;
    
    if (words.length <= maxWords) {
      return html;
    }
    
    // Truncate and add ellipsis
    const truncatedWords = words.slice(0, maxWords).join(' ');
    return truncatedWords + '...';
  }
}