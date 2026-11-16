// course-card.component.ts
import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  inject,
  PLATFORM_ID,
  ChangeDetectionStrategy,
  signal,
  computed,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../../environments/environment.development';
import { TiltGlareDirective } from '../../directives/tilt-glare.directive';
import { RatingStarsComponent } from '../rating-stars/rating-stars.component';
import { FaDurationSecondsPipe } from '../../pipes/fa-duration-seconds.pipe';
import { optimizeCloudinaryUrl, optimizeAvatarUrl } from '../../../core/utils/image.utils';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-course-card',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, TiltGlareDirective, RatingStarsComponent, FaDurationSecondsPipe],
  templateUrl: './course-card.component.html',
  styleUrls: ['./course-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseCardComponent implements OnInit, OnDestroy, OnChanges {
  @Input() course: any = {};
  @Input() index: number = 0;

  private platformId = inject(PLATFORM_ID);
  private api = inject(ApiService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);
  private brokenImages = signal<Record<string, boolean>>({});
  private countdownTimer: any = null;

  // ⭐ Signals برای Reactive بودن مقادیر ریتینگ
  readonly ratingValue = signal<number>(0);
  readonly reviewCountValue = signal<number>(0);

  readonly countdownRemaining = signal<string>('');
  readonly countdownActive = signal<boolean>(false);
  readonly countdownProgress = signal<number>(0);

  readonly isCountdownDiscount = computed(() => {
    return (
      this.course?.pricing?.discountType === 'countdown' &&
      this.course?.pricing?.discountActive === true
    );
  });

  readonly isCampaignDiscount = computed(() => {
    return (
      this.course?.pricing?.campaignApplied === true &&
      this.course?.pricing?.discountActive === true
    );
  });

  readonly activeCampaign = computed(() => {
    return this.course?.activeCampaign || null;
  });

  readonly campaignDiscountPercent = computed(() => {
    const pricing = this.course?.pricing;
    if (!pricing || !pricing.campaignApplied) return 0;
    const originalPrice = this.course?.price || 0;
    const currentPrice = pricing.currentPrice || 0;
    if (originalPrice <= 0) return 0;
    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  });

  // ⭐ Wishlist related
  readonly isInWishlist = signal<boolean>(false);
  readonly wishlistLoading = signal<boolean>(false);

  @Output() wishlistToggled = new EventEmitter<{ courseId: string; inWishlist: boolean }>();

  getCampaignIcon(): string {
    const campaign = this.activeCampaign();
    if (!campaign) return 'local_fire_department';
    switch (campaign.theme) {
      case 'fire': return 'local_fire_department';
      case 'cold': return 'ac_unit';
      case 'gold': return 'workspace_premium';
      case 'green': return 'eco';
      default: return 'local_fire_department';
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['course']) {
      this.updateRatingFromCourse();
    }
  }

  private updateRatingFromCourse(): void {
    const c = this.course;
    if (!c) {
      this.ratingValue.set(0);
      this.reviewCountValue.set(0);
      return;
    }

    // استخراج rating با پشتیبانی از انواع
    let rating = 0;
    if (typeof c.averageRating === 'number' && !isNaN(c.averageRating)) {
      rating = c.averageRating;
    } else if (typeof c.rating === 'number' && !isNaN(c.rating)) {
      rating = c.rating;
    } else if (c.averageRating) {
      const parsed = parseFloat(c.averageRating);
      if (!isNaN(parsed)) rating = parsed;
    }

    // استخراج تعداد نظرات
    let count = 0;
    if (typeof c.totalReviews === 'number' && !isNaN(c.totalReviews)) {
      count = c.totalReviews;
    } else if (typeof c.reviewsCount === 'number' && !isNaN(c.reviewsCount)) {
      count = c.reviewsCount;
    } else if (c.totalReviews) {
      const parsed = parseInt(c.totalReviews);
      if (!isNaN(parsed)) count = parsed;
    }

    this.ratingValue.set(rating);
    this.reviewCountValue.set(count);
  }

  ngOnInit(): void {
    this.updateRatingFromCourse();
    if (isPlatformBrowser(this.platformId) && this.isCountdownDiscount()) {
      this.startCountdown();
    }
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private startCountdown(): void {
    const calc = () => {
      const pricing = this.course?.pricing;
      if (!pricing?.discountEndAt) return;

      const serverTime = pricing.serverTime
        ? new Date(pricing.serverTime).getTime()
        : Date.now();
      const endTime = new Date(pricing.discountEndAt).getTime();
      const startTime = pricing.discountStartAt
        ? new Date(pricing.discountStartAt).getTime()
        : serverTime;
      const total = endTime - startTime;
      const remaining = endTime - serverTime;

      if (remaining <= 0) {
        this.countdownActive.set(false);
        this.countdownRemaining.set('اتمام تخفیف');
        this.countdownProgress.set(100);
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
        return;
      }

      this.countdownActive.set(true);
      const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;
      this.countdownProgress.set(Math.min(progress, 100));

      const totalSec = Math.floor(remaining / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;

      if (days > 0) {
        this.countdownRemaining.set(
          `${days}روز ${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        );
      } else {
        this.countdownRemaining.set(
          `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        );
      }
    };

    calc();
    this.countdownTimer = setInterval(calc, 1000);
  }

  resolveImageUrl(raw: unknown): string | null {
    if (raw == null) return null;
    let url = '';
    if (typeof raw === 'string') {
      url = raw.trim();
    } else if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      url = String(o['url'] ?? o['path'] ?? o['secure_url'] ?? o['src'] ?? '').trim();
    }
    if (!url || url === 'null' || url === 'undefined') return null;
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // 🖼️ بهینه‌سازی Cloudinary — کاهش چشمگیر حجم دانلود
      return optimizeCloudinaryUrl(url, 640, 360, 'fill', 'auto');
    }
    if (url.startsWith('//')) return 'https:' + url;
    const base =
      environment && environment.socketUrl ? environment.socketUrl.replace(/\/$/, '') : '';
    return url.startsWith('/') ? base + url : base + '/' + url;
  }

  shouldShowImage(key: string, rawUrl: unknown): boolean {
    const fullUrl = this.resolveImageUrl(rawUrl);
    return !!fullUrl && !this.brokenImages()[key];
  }

  onImageError(key: string, event: Event): void {
    this.brokenImages.update((m) => {
      const copy = { ...m };
      copy[key] = true;
      return copy;
    });
    const img = event.target as HTMLImageElement | null;
    if (img) img.onerror = null;
  }

  courseThumb(c: any): unknown {
    return c?.thumbnail ?? c?.image ?? c?.cover ?? c?.coverImage ?? null;
  }

  faNum(n?: number | string): string {
    if (n === null || n === undefined) return '۰';
    return Number(n).toLocaleString('fa-IR');
  }

  instructorColor(): string {
    return (
      this.course?.instructor?.color ||
      this.course?.instructor?.instructorProfile?.color ||
      '#22d3ee'
    );
  }

  instructorInitial(): string {
    const name = this.course?.instructor?.fullName || this.course?.instructor?.name || 'مدرس';
    if (!name) return 'م';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return parts[0][0] + '\u200C' + parts[1][0];
    }
    return name[0] || 'م';
  }

  /**
   * 🖼️ عکس مدرس دوره
   * اگر مدرس آواتار داشته باشد عکس نمایش داده می‌شود،
   * در غیر این صورت fallback به حرف اول نام (زیر آواتار).
   */
  instructorAvatarUrl(): string | null {
    const instructor: any = this.course?.instructor;
    const raw =
      instructor?.avatar ||
      instructor?.image ||
      instructor?.profileImage ||
      instructor?.instructorProfile?.avatar ||
      (this.course as any)?.instructorAvatar ||
      '';
    if (!raw || typeof raw !== 'string') return null;

    // بهینه‌سازی Cloudinary برای آواتار (۱۲۰px کافی است)
    const optimized = optimizeAvatarUrl(raw, 120);
    if (!optimized) return null;
    if (optimized.startsWith('http://') || optimized.startsWith('https://') || optimized.startsWith('data:')) {
      return optimized;
    }
    return this.resolveImageUrl(optimized);
  }

  /** آیا آواتار مدرس قابل نمایش است؟ */
  hasInstructorAvatar(): boolean {
    return !!this.instructorAvatarUrl();
  }

  categoryGradient(): string {
    const g = this.course?.category?.gradient;
    if (Array.isArray(g) && g.length >= 2) {
      return 'linear-gradient(120deg, ' + g[0] + ', ' + g[1] + ')';
    }
    return 'linear-gradient(120deg, #8b5cf6, #d946ef)';
  }

  hasDiscount(): boolean {
    if (this.course?.isFree || this.course?.price === 0) return false;
    const dp = this.course?.pricing?.currentDiscountPercent;
    if (dp && dp > 0) return true;
    if (
      this.course?.discountPrice &&
      this.course?.price &&
      this.course.discountPrice < this.course.price
    )
      return true;
    return false;
  }

  finalPrice(): number {
    if (this.course?.pricing?.currentPrice !== undefined)
      return this.course.pricing.currentPrice;
    if (this.course?.currentPrice !== undefined && this.course.currentPrice > 0)
      return this.course.currentPrice;
    if (this.course?.discountPrice && this.course.discountPrice > 0)
      return this.course.discountPrice;
    return this.course?.price || 0;
  }

  discountPercent(): number {
    const dp = this.course?.pricing?.currentDiscountPercent;
    if (dp && dp > 0) return dp;
    if (this.course?.discountPercentage && this.course.discountPercentage > 0)
      return this.course.discountPercentage;
    if (
      this.course?.discountPrice &&
      this.course?.price &&
      this.course.discountPrice < this.course.price
    ) {
      return Math.round(
        ((this.course.price - this.course.discountPrice) / this.course.price) * 100,
      );
    }
    return 0;
  }

  levelLabel(level: string): string {
    const map: Record<string, string> = {
      beginner: 'مقدماتی',
      intermediate: 'متوسط',
      advanced: 'پیشرفته',
      'all-levels': 'همه سطوح',
    };
    return map[level] || level || '';
  }

  // ⭐ Backward-compat
  getRating(): number {
    return this.ratingValue();
  }

  getReviewCount(): number {
    return this.reviewCountValue();
  }

  // ⭐ Wishlist Methods
  private checkWishlistStatus(): void {
    if (!this.authService.isAuthenticated() || !this.course?._id) return;

    this.api.get<any>(`/wishlist/check/${this.course._id}`).subscribe({
      next: (res: any) => {
        if (res.success) {
          this.isInWishlist.set(res.data?.inWishlist || false);
        }
      },
      error: () => {}
    });
  }

  toggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.authService.isAuthenticated()) {
      this.toastService.info('برای افزودن به علاقه‌مندی‌ها ابتدا وارد شوید');
      return;
    }

    if (!this.course?._id) return;

    this.wishlistLoading.set(true);

    this.api.post<any>('/wishlist/toggle', { courseId: this.course._id }).subscribe({
      next: (res: any) => {
        this.wishlistLoading.set(false);
        if (res.success) {
          const inWishlist = res.data?.inWishlist || !this.isInWishlist();
          this.isInWishlist.set(inWishlist);
          this.wishlistToggled.emit({ courseId: this.course._id, inWishlist });
          this.toastService.success(
            inWishlist ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد'
          );
        }
      },
      error: (err: any) => {
        this.wishlistLoading.set(false);
        this.toastService.error(err?.error?.message || 'خطا در بروزرسانی علاقه‌مندی‌ها');
      }
    });
  }
}