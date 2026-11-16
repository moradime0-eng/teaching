import {
  Component,
  OnInit,
  signal,
  inject,
  OnDestroy,
  HostListener,
  ElementRef,
  ViewChild,
  AfterViewInit,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CourseService } from '../../../core/services/course.service';
import { ReviewService } from '../../../core/services/review.service';
import { CartService } from '../../../core/services/cart.service';
import { AuthService } from '../../../core/services/auth.service';
import { VideoUploadService } from '../../../core/services/video-upload.service';
import { Course } from '../../../core/models/course.model';
import { Review } from '../../../core/models/review.model';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { FaNumPipe } from '../../../shared/pipes/fa-num.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';
import { RevealDirective } from '../../../shared/directives/reveal.directive';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import { FormsModule } from '@angular/forms';
import { SeoService } from '../../../core/services/seo.service';
import { ToastService } from '../../../core/services/toast.service';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { environment } from '../../../../environments/environment.development';
import { isRawMediaUrl } from '../../../core/utils/media-guard.utils';

type TabKey = 'curriculum' | 'instructor' | 'description' | 'reviews';

@Component({
  selector: 'app-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    RatingStarsComponent,
    TomanPipe,
    DurationPipe,
    FaNumPipe,
    ImageFallbackDirective,
    SanitizeHtmlPipe,
    MarkdownPipe,
    RevealDirective,
    RichTextEditorComponent,
    FormsModule,
    VideoPlayerComponent,
  ],
  templateUrl: './detail.component.html',
  styleUrl: './detail.component.scss',
})
export class DetailComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private courseService = inject(CourseService);
  private reviewService = inject(ReviewService);
  private cartService = inject(CartService);
  private seoService = inject(SeoService);
  public router = inject(Router);
  private toast = inject(ToastService);
  public authService = inject(AuthService);
  public sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);
  private videoUploadService = inject(VideoUploadService);

  @ViewChild('tabsNav') tabsNav?: ElementRef<HTMLElement>;

  // States
  course = signal<Course | null>(null);
  /** ⭐ نمای alias برای `course` — template از `data.*` استفاده می‌کند */
  get data(): Course {
    return this.course() as Course;
  }
  isLoading = signal<boolean>(true);
  hasError = signal<boolean>(false);
  errorMessage = signal<string>('');
  activeTab = signal<TabKey>('curriculum');

  showPromoVideoModal = signal<boolean>(false);
  showLessonModal = signal<boolean>(false);
  selectedLesson = signal<any | null>(null);

  // States مربوط به Preview درس‌ها
  lessonPreviewVideoUrl = signal<string>('');
  isLoadingLessonPreview = signal<boolean>(false);
  lessonPreviewError = signal<string>('');

  reviews = signal<Review[]>([]);
  reviewsPage = signal<number>(1);
  totalReviewsPages = signal<number>(0);
  isLoadingReviews = signal<boolean>(false);
  newReviewRating = signal<number>(0);
  newReviewTitle = signal<string>('');
  newReviewComment = signal<string>('');
  reviewCommentModel = '';
  isSubmittingReview = signal<boolean>(false);
  reviewHoverRating = signal<number>(0);

  isEnrolled = signal<boolean>(false);
  isInCart = signal<boolean>(false);
  addingToCart = signal<boolean>(false);
  linkCopied = signal<boolean>(false);

  isFree = computed(() => this.course()?.isFree === true);

  // ⏱️ Countdown Timer
  countdownTimer = signal<string | null>(null);
  countdownActive = signal<boolean>(false);
  countdownExpired = signal<boolean>(false);
  private countdownInterval: any = null;

  private lessonPreviewRefreshTimer: any = null;
  private readonly LESSON_PREVIEW_REFRESH_INTERVAL = 90 * 60 * 1000;

  // Computed pricing
  pricingInfo = computed(() => this.course()?.pricing || null);
  countdownDiscountPercent = computed(() => this.pricingInfo()?.currentDiscountPercent || 0);
  countdownOriginalPrice = computed(() => this.pricingInfo()?.originalPrice || 0);
  countdownCurrentPrice = computed(() => this.pricingInfo()?.currentPrice || 0);
  countdownServerTime = computed(() => this.pricingInfo()?.serverTime || null);
  countdownEndAt = computed(() => this.pricingInfo()?.discountEndAt || null);
  countdownStartAt = computed(() => this.pricingInfo()?.discountStartAt || null);
  isCountdownDiscount = computed(() => this.pricingInfo()?.discountType === 'countdown');
  discountActive = computed(() => this.pricingInfo()?.discountActive === true);

  // 🎯 کمپین (Campaign) — قیمت ویژهٔ سراسری
  /** آیا کمپین روی این دوره اعمال شده است؟ */
  campaignApplied = computed(() => this.pricingInfo()?.campaignApplied === true);
  /** اطلاعات بنر کمپین (عنوان، متن، پایان، تم) */
  activeCampaign = computed(() => (this.course() as any)?.activeCampaign || null);
  /** درصد تخفیف کمپین (در صورت اعمال) */
  campaignDiscountPercent = computed(
    () => this.pricingInfo()?.campaignDiscountPercent || this.pricingInfo()?.currentDiscountPercent || 0,
  );
  /** قیمت اصلی (قبل از تخفیف کمپین) */
  campaignOriginalPrice = computed(
    () => this.pricingInfo()?.originalPrice || this.course()?.price || 0,
  );
  /** قیمت نهایی بعد از تخفیف کمپین */
  campaignFinalPrice = computed(() => this.pricingInfo()?.currentPrice || 0);
  /** قیمت قبل از اعمال کمپین (برای نمایش «قیمت قبل کمپین») */
  priceBeforeCampaign = computed(() => this.pricingInfo()?.priceBeforeCampaign || 0);

  /** ⭐ قیمت نهایی نمایش‌داده‌شده (کمپین > تخفیف دستی > قیمت اصلی) */
  displayPrice = computed(() => {
    const p = this.pricingInfo();
    const finalPrice = p?.currentPrice ?? 0;
    if (p?.campaignApplied && finalPrice > 0) return finalPrice;
    if (this.isCountdownDiscount() && finalPrice > 0) return finalPrice;
    const c = this.course() as any;
    if (c?.discountPrice && c.discountPrice > 0) return c.discountPrice;
    return c?.price || 0;
  });

  /** ⭐ قیمت «قبل از تخفیف» برای نمایش خط‌خورده */
  displayOldPrice = computed(() => {
    const p = this.pricingInfo();
    const c = this.course() as any;
    const finalPrice = p?.currentPrice ?? 0;
    if (p?.campaignApplied && finalPrice > 0) return p?.originalPrice || c?.price || 0;
    if (this.isCountdownDiscount() && finalPrice > 0) return p?.originalPrice || c?.price || 0;
    if (c?.discountPrice && c.discountPrice > 0) return c.price || 0;
    return 0;
  });

  /** ⭐ درصد تخفیف نمایش‌داده‌شده (۰ = بدون تخفیف) */
  displayDiscountPercent = computed(() => {
    if (this.campaignApplied()) return this.campaignDiscountPercent();
    if (this.isCountdownDiscount()) return this.countdownDiscountPercent();
    return (this.course() as any)?.discountPercentage || 0;
  });

  /** ⭐ آیا باید بنر کمپین در دیتیل نمایش داده شود؟ */
  showCampaignBanner = computed(() => this.campaignApplied() && !!this.activeCampaign());

  expandedSections = signal<Set<string>>(new Set());
  relatedCourses = signal<Course[]>([]);

  scrollProgress = signal<number>(0);
  pillLeft = signal<number>(0);
  pillWidth = signal<number>(0);

  defaultAvatar =
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%237c6cf8"/><text x="50" y="58" font-size="45" fill="%23ffffff" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">👤</text></svg>';

  private avatarGradients = [
    'linear-gradient(135deg,#7c6cf8,#d66bff)',
    'linear-gradient(135deg,#34d399,#7c6cf8)',
    'linear-gradient(135deg,#f5b54a,#fb7185)',
    'linear-gradient(135deg,#d66bff,#fb7185)',
    'linear-gradient(135deg,#5b4ae0,#34d399)',
  ];

  totalLecturesComputed = computed(() => {
    const c = this.course();
    if (!c) return 0;
    if (c.totalLectures) return c.totalLectures;
    return (c.sections || []).reduce((sum, s) => sum + (s.lectures?.length || 0), 0);
  });

  totalDurationComputed = computed(() => {
    const c = this.course();
    if (!c) return 0;
    if (c.totalDuration) return c.totalDuration;
    return (c.sections || []).reduce((sum, s) => {
      return sum + (s.lectures || []).reduce((a, l) => a + (l.duration || 0), 0);
    }, 0);
  });

  freePreviewCount = computed(() => {
    const c = this.course();
    if (!c) return 0;
    return (c.sections || []).reduce((sum, s) => {
      return sum + (s.lectures || []).filter((l) => l.isFreePreview).length;
    }, 0);
  });

  totalReviewsCount = computed(() => this.course()?.totalReviews || 0);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const slug = params.get('slug');
      if (slug) {
        this.getCourseDetails(slug);
      } else {
        this.isLoading.set(false);
        this.hasError.set(true);
        this.errorMessage.set('آدرس دوره نامعتبر است.');
      }
    });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.updatePill(), 200);
    }
  }

  ngOnDestroy(): void {
    this.closeVideoModal();
    this.closeLessonModal();
    this.unlockScroll();
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.clearLessonPreviewTimer();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    this.scrollProgress.set(max > 0 ? Math.min(1, Math.max(0, h.scrollTop / max)) : 0);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updatePill();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.showPromoVideoModal()) this.closeVideoModal();
    if (this.showLessonModal()) this.closeLessonModal();
  }

  getCourseDetails(slug: string): void {
    this.isLoading.set(true);
    this.hasError.set(false);

    this.courseService.getCourseBySlug(slug).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const courseData = res.data as any;
          const reviewsData: Review[] = courseData.reviews || [];
          delete courseData.reviews;

          const normalized = this.normalizeCourseData(courseData);
          this.course.set(normalized);
          this.reviews.set(reviewsData);

          this.startCountdownTimer(normalized);

          this.seoService.setFullSeo({
            title: normalized.title,
            description:
              normalized.metaDescription || normalized.shortDescription || normalized.title,
          });

          if (normalized.sections && normalized.sections.length > 0) {
            this.expandedSections.set(new Set([normalized.sections[0]._id]));
          }

          if (this.authService.isAuthenticated()) {
            this.checkEnrollment(normalized._id);
            this.checkCart(normalized._id);
          }

          this.loadRelatedCourses(normalized._id);
          if (isPlatformBrowser(this.platformId)) {
            setTimeout(() => this.updatePill(), 150);
          }
        } else {
          this.hasError.set(true);
          this.errorMessage.set('دوره مورد نظر یافت نشد.');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.hasError.set(true);
        if (err.status === 404) {
          this.errorMessage.set('دوره مورد نظر یافت نشد یا هنوز منتشر نشده است.');
        } else {
          this.errorMessage.set('خطا در دریافت اطلاعات دوره. لطفاً مجدداً تلاش کنید.');
        }
      },
    });
  }

  private checkEnrollment(courseId: string): void {
    this.courseService.checkEnrollment(courseId).subscribe({
      next: (res) => this.isEnrolled.set(res.success && (res.data?.enrolled ?? false)),
      error: () => this.isEnrolled.set(false),
    });
  }

  private checkCart(courseId: string): void {
    const anyCart = this.cartService as any;
    if (typeof anyCart.hasItem === 'function') {
      try {
        const res = anyCart.hasItem(courseId);
        if (res && typeof res.subscribe === 'function') {
          res.subscribe({
            next: (v: any) => this.isInCart.set(!!v),
            error: () => this.isInCart.set(false),
          });
        } else {
          this.isInCart.set(!!res);
        }
      } catch {
        this.isInCart.set(false);
      }
    }
  }

  loadRelatedCourses(courseId: string): void {
    this.courseService.getRelatedCourses(courseId).subscribe({
      next: (res) => {
        if (res.success) {
          this.relatedCourses.set((res.data || []).map((c: any) => this.normalizeCourseData(c)));
        }
      },
      error: (err) => {
        console.warn('Could not load related courses:', err?.message || 'Unknown error');
        this.relatedCourses.set([]);
      },
    });
  }

  // ================== REVIEWS ==================

  loadReviews(slug: string, page: number = 1): void {
    const courseId = this.course()?._id;
    if (!courseId) return;

    this.isLoadingReviews.set(true);
    this.reviewService.getCourseReviews(courseId, page, 10).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          if (page === 1) {
            this.reviews.set(res.data);
          } else {
            this.reviews.update((prev) => [...prev, ...res.data]);
          }
          this.reviewsPage.set(page);
          const totalPages = res.meta?.totalPages || res.pagination?.totalPages || 0;
          this.totalReviewsPages.set(totalPages);
        }
        this.isLoadingReviews.set(false);
      },
      error: () => {
        this.isLoadingReviews.set(false);
      },
    });
  }

  loadMoreReviews(): void {
    const slug = this.route.snapshot.params['slug'];
    if (slug) {
      this.loadReviews(slug, this.reviewsPage() + 1);
    }
  }

  setReviewRating(rating: number): void {
    this.newReviewRating.set(rating);
  }

  setReviewHoverRating(rating: number): void {
    this.reviewHoverRating.set(rating);
  }

  getReviewCommentLength(): number {
    return this.reviewCommentModel.replace(/<[^>]*>/g, '').trim().length;
  }

  // ================== LIVE COUNTDOWN ==================

  private calculateLiveCountdown(pricing: any, currentServerNow: number): void {
    if (!pricing || pricing.discountType !== 'countdown' || !pricing.discountEndAt) {
      return;
    }

    const course = this.course();
    const cd: any = course?.countdownDiscount || {};

    const startAt = new Date(pricing.discountStartAt || cd.startAt || pricing.serverTime || Date.now()).getTime();
    const endAt = new Date(pricing.discountEndAt || cd.endAt).getTime();
    const now = currentServerNow;

    if (now >= endAt) {
      this.countdownTimer.set('۰۰:۰۰:۰۰');
      this.countdownActive.set(false);
      this.countdownExpired.set(true);

      const finalPercent = pricing.finalPercent ?? cd.finalPercent ?? 0;
      const finalPrice = Math.round((pricing.originalPrice || 0) * (1 - finalPercent / 100));

      this.course.update((c) => {
        if (!c || !c.pricing) return c;
        return {
          ...c,
          pricing: {
            ...c.pricing,
            currentDiscountPercent: finalPercent,
            currentPrice: finalPrice,
            discountActive: finalPercent > 0,
          },
        };
      });

      if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
      return;
    }

    if (now < startAt) return;

    const totalDuration = endAt - startAt;
    const elapsed = now - startAt;
    const progress = Math.min(Math.max(elapsed / totalDuration, 0), 1);

    const initialPercent = pricing.initialPercent ?? cd.initialPercent ?? 100;
    const finalPercent = pricing.finalPercent ?? cd.finalPercent ?? 0;
    const mode = pricing.countdownMode ?? cd.mode ?? 'linear';
    const stepPercent = pricing.stepPercent ?? cd.stepPercent;
    const stepIntervalMinutes = pricing.stepIntervalMinutes ?? cd.stepIntervalMinutes;

    let currentPercent = initialPercent;

    if (mode === 'step' && stepPercent && stepIntervalMinutes) {
      const stepIntervalMs = stepIntervalMinutes * 60 * 1000;
      const totalSteps = Math.floor(totalDuration / stepIntervalMs);
      if (totalSteps > 0) {
        const currentStep = Math.floor(progress * totalSteps);
        const discountDecrease = currentStep * stepPercent;
        currentPercent = Math.min(Math.max(initialPercent - discountDecrease, finalPercent), initialPercent);
      }
    } else {
      currentPercent = Math.min(Math.max(initialPercent - progress * (initialPercent - finalPercent), finalPercent), initialPercent);
    }

    currentPercent = Math.round(currentPercent);
    const newCurrentPrice = Math.round((pricing.originalPrice || 0) * (1 - currentPercent / 100));

    this.course.update((c) => {
      if (!c || !c.pricing) return c;
      return {
        ...c,
        pricing: {
          ...c.pricing,
          currentDiscountPercent: currentPercent,
          currentPrice: newCurrentPrice,
          discountActive: currentPercent > 0,
        },
      };
    });

    const diff = endAt - now;
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number): string => String(n).padStart(2, '0');
    this.countdownTimer.set(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    this.countdownActive.set(true);
    this.countdownExpired.set(false);
  }

  private startCountdownTimer(course: Course): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const pricing = course.pricing;
    if (!pricing || pricing.discountType !== 'countdown') {
      this.countdownActive.set(false);
      this.countdownExpired.set(false);
      this.countdownTimer.set(null);
      return;
    }

    const serverTimeMs = new Date(pricing.serverTime || Date.now()).getTime();
    const localTimeMs = Date.now();
    const timeOffset = serverTimeMs - localTimeMs;

    const tick = () => {
      const currentEstimatedServerNow = Date.now() + timeOffset;
      this.calculateLiveCountdown(pricing, currentEstimatedServerNow);
    };

    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  submitReview(): void {
    const slug = this.route.snapshot.params['slug'];
    const rating = this.newReviewRating();
    const comment = this.reviewCommentModel;
    const commentText = comment.replace(/<[^>]*>/g, '').trim();

    if (rating < 1) {
      this.toast.warning('لطفاً یک امتیاز انتخاب کنید.', 'خطا');
      return;
    }
    if (commentText.length < 10) {
      this.toast.warning('متن نظر باید حداقل ۱۰ کاراکتر باشد.', 'خطا');
      return;
    }

    this.isSubmittingReview.set(true);
    this.reviewService
      .createReviewBySlug(slug, {
        rating,
        title: this.newReviewTitle().trim() || undefined,
        comment,
      })
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.reviews.update((prev) => [res.data!, ...prev]);
            this.newReviewRating.set(0);
            this.newReviewTitle.set('');
            this.newReviewComment.set('');
            this.reviewCommentModel = '';
            this.toast.success('نظر شما با موفقیت ثبت شد.', 'موفق', 4000);
          }
          this.isSubmittingReview.set(false);
        },
        error: (err) => {
          this.isSubmittingReview.set(false);
          this.toast.error(err?.error?.message || err.message || 'خطا در ثبت نظر', 'خطا', 5000);
        },
      });
  }

  canReview(): boolean {
    return this.isEnrolled() && this.authService.isAuthenticated();
  }

  // ================== TABS LOGIC ==================
  setActiveTab(t: TabKey): void {
    this.activeTab.set(t);
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.updatePill(), 50);
    }
  }

  updatePill(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const nav = this.tabsNav?.nativeElement;
    if (!nav) return;
    const active = nav.querySelector<HTMLButtonElement>('.tab-btn.active');
    if (!active) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = active.getBoundingClientRect();
    this.pillLeft.set(btnRect.left - navRect.left);
    this.pillWidth.set(btnRect.width);
  }

  scrollToTabs(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = this.tabsNav?.nativeElement;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ================== CART ==================
  addToCart(): void {
    const activeCourse = this.course();
    if (!activeCourse) return;
    if (this.isInCart()) {
      this.router.navigate(['/cart']);
      return;
    }

    this.addingToCart.set(true);
    this.cartService.addToCart(activeCourse._id).subscribe({
      next: () => {
        this.addingToCart.set(false);
        this.isInCart.set(true);
        this.toast.success('دوره آموزشی به سبد خرید اضافه شد.', 'افزودن به سبد', 4000, {
          label: 'مشاهده سبد',
          onClick: () => this.router.navigate(['/cart']),
        });
      },
      error: (err) => {
        this.addingToCart.set(false);
        if (err.status === 401) {
          this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
        } else {
          this.toast.error('خطا در افزودن دوره به سبد خرید.', 'خطا', 5000);
        }
      },
    });
  }

  goToLearning(): void {
    const c = this.course();
    if (!c) return;
    
    // اگر دوره رایگان است، ابتدا ثبت‌نام کن
    if (c.isFree) {
      this.enrollInFreeCourse(c._id);
    } else {
      this.router.navigate(['/learn', c._id]);
    }
  }

  private enrollInFreeCourse(courseId: string): void {
    this.courseService.enrollInFreeCourse(courseId).subscribe({
      next: (res) => {
        if (res.success) {
          this.toast.success('ثبت‌نام در دوره رایگان با موفقیت انجام شد', 'موفقیت', 3000);
          this.isEnrolled.set(true);
          this.router.navigate(['/learn', courseId]);
        } else {
          this.toast.error(res.message || 'خطا در ثبت‌نام در دوره رایگان', 'خطا', 5000);
        }
      },
      error: (err) => {
        if (err.status === 401) {
          this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
        } else {
          this.toast.error(err?.error?.message || 'خطا در ثبت‌نام در دوره رایگان', 'خطا', 5000);
        }
      }
    });
  }

  // ================== SHARE ==================
  shareOn(platform: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = window.location.href;
    const title = this.course()?.title || '';
    const urls: Record<string, string> = {
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    };
    if (urls[platform]) window.open(urls[platform], '_blank', 'width=600,height=400');
  }

  copyLink(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.linkCopied.set(true);
      this.toast.success('لینک دوره با موفقیت کپی شد.', 'کپی لینک', 3000);
      setTimeout(() => this.linkCopied.set(false), 2000);
    });
  }

  // ================== CURRICULUM ==================
  toggleSection(sectionId: string): void {
    this.expandedSections.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(sectionId)) newSet.delete(sectionId);
      else newSet.add(sectionId);
      return newSet;
    });
  }

  isSectionExpanded(sectionId: string): boolean {
    return this.expandedSections().has(sectionId);
  }

  expandAllSections(): void {
    const ids = (this.course()?.sections || []).map((s) => s._id);
    this.expandedSections.set(new Set(ids));
  }

  collapseAllSections(): void {
    this.expandedSections.set(new Set());
  }

  allExpanded(): boolean {
    const secs = this.course()?.sections || [];
    return secs.length > 0 && this.expandedSections().size === secs.length;
  }

  canAccessLesson(lesson: any): boolean {
    if (this.isFree()) return true;
    if (this.isEnrolled()) return true;
    return lesson.isFreePreview === true || lesson.isFree === true;
  }

  // ================== INSTRUCTOR & REVIEWS HELPERS ==================
  getInstructorAvatar(): string {
    const c = this.course();
    if (!c || !c.instructor) return this.defaultAvatar;
    const instructor = c.instructor as any;
    const avatar =
      instructor.avatar || instructor.profileImage || instructor.instructorProfile?.avatar;
    if (!avatar || avatar === 'null' || avatar === 'undefined') return this.defaultAvatar;
    return this.resolveMediaUrl(avatar) || this.defaultAvatar;
  }

  /** پیدا کردن دوره مرتبط با یک پیش‌نیاز (بر اساس title) */
  getReqCourse(req: string, course: any): { _id: string; title: string; slug: string } | null {
    if (!course?.requirementCourses?.length) return null;
    return course.requirementCourses.find(
      (rc: any) => rc.title?.trim().toLowerCase() === req.trim().toLowerCase()
    ) || null;
  }

  handleAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.onerror = null;
      img.src = this.defaultAvatar;
    }
  }

  getInstructorSocialLinks() {
    const c = this.course();
    const profile = c?.instructor?.instructorProfile;
    if (!profile) return null;
    return {
      linkedin: profile.socialLinks?.linkedin,
      twitter: profile.socialLinks?.twitter,
      youtube: (profile.socialLinks as any)?.youtube,
      instagram: (profile.socialLinks as any)?.instagram,
      website: profile.website,
    };
  }

  getInstructorExpertise(): string[] {
    return this.course()?.instructor?.instructorProfile?.expertise || [];
  }

  getInstructorBio(): string {
    const c = this.course();
    return (
      c?.instructor?.instructorProfile?.biography ||
      c?.instructor?.bio ||
      'توضیحات بیشتری درباره مدرس ثبت نشده است.'
    );
  }

  goToInstructorTab(): void {
    this.setActiveTab('instructor');
    this.scrollToTabs();
  }

  getReviewUserAvatar(review: Review): string | null {
    const user = review.user;
    if (typeof user === 'object' && user) {
      const a = (user as any).avatar;
      if (a) return this.resolveMediaUrl(a);
    }
    return null;
  }

  getReviewUserName(review: Review): string {
    const user = review.user;
    if (typeof user === 'object' && user) {
      return (user as any).fullName || 'کاربر';
    }
    return 'کاربر';
  }

  getReviewUserInitial(review: Review): string {
    const n = this.getReviewUserName(review);
    return n?.trim()?.charAt(0) || 'ک';
  }

  getReviewAvatarGradient(review: Review): string {
    const name = this.getReviewUserName(review);
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return this.avatarGradients[h % this.avatarGradients.length];
  }

  getStarPercentage(star: number): number {
    const dist = this.course()?.ratingDistribution;
    if (!dist) return 0;
    const total = this.course()?.totalReviews || 1;
    const map: Record<number, number> = {
      5: dist.five,
      4: dist.four,
      3: dist.three,
      2: dist.two,
      1: dist.one,
    };
    return ((map[star] || 0) / total) * 100;
  }

  getStarCount(star: number): number {
    const dist = this.course()?.ratingDistribution;
    if (!dist) return 0;
    const map: Record<number, number> = {
      5: dist.five,
      4: dist.four,
      3: dist.three,
      2: dist.two,
      1: dist.one,
    };
    return map[star] || 0;
  }

  getCourseReviews(): Review[] {
    return (this.course() as any)?.reviews || [];
  }

  getCourseCurrentPrice(course: any): number {
    if (!course || course.isFree) return 0;

    if (course.pricing?.currentPrice !== undefined) {
      return course.pricing.currentPrice;
    }

    if (course.currentPrice !== undefined && course.currentPrice > 0) {
      return course.currentPrice;
    }

    if (course.discountPrice && course.discountPrice > 0) {
      return course.discountPrice;
    }

    return course.price || 0;
  }

  getCourseDiscountPercent(course: any): number {
    if (!course || course.isFree) return 0;

    if (course.pricing?.currentDiscountPercent !== undefined && course.pricing.currentDiscountPercent > 0) {
      return course.pricing.currentDiscountPercent;
    }

    if (course.discountPercentage !== undefined && course.discountPercentage > 0) {
      return course.discountPercentage;
    }

    if (course.discountPrice && course.price && course.discountPrice < course.price) {
      return Math.round(((course.price - course.discountPrice) / course.price) * 100);
    }

    return 0;
  }

  // ================== PROMO & LESSON VIDEO MODALS ==================
  getPromoVideoUrl(): string | null {
    const c = this.course();
    if (!c) return null;

    if (this.isUploadedPromoVideo()) {
      // 🔒 ویدیوی معرفی فقط از مسیر محافظت‌شدهٔ بک‌اند پخش می‌شود
      return `${environment.apiUrl}/upload/stream/${c._id}`;
    }

    if (c.promoVideoUrl) return this.resolveMediaUrl(c.promoVideoUrl);
    if (c.promoVideo) return this.resolveMediaUrl(c.promoVideo);
    return null;
  }

  hasPromoVideo(): boolean {
    return !!this.getPromoVideoUrl();
  }

  isUploadedPromoVideo(): boolean {
    const c = this.course();
    if (!c) return false;

    // 🔒 فیلد پرچم‌دار از بک‌اند (لینک خام حذف شده است)
    if (c.promoVideoProtected) return true;

    if (c.promoVideoType === 'upload' || (c.promoVideoType as any) === 'video') return true;

    const url = c.promoVideo || c.promoVideoUrl || '';
    if (url.includes('arvanstorage') || url.includes('s3.ir-thr') || url.includes('/upload/stream')) {
      return true;
    }
    return false;
  }

  getPromoVideoEmbedUrl(): SafeResourceUrl | null {
    const url = this.getPromoVideoUrl();
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch)
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`,
      );
    const apMatch = url.match(/aparat\.com\/v\/([a-zA-Z0-9_-]+)/);
    if (apMatch)
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.aparat.com/video/video/embed/videohash/${apMatch[1]}/vt/frame?autoplay=1`,
      );
    return null;
  }

  openVideoModal(): void {
    if (this.hasPromoVideo()) {
      this.showPromoVideoModal.set(true);
      this.lockScroll();
    }
  }

  closeVideoModal(): void {
    this.showPromoVideoModal.set(false);
    this.unlockScroll();
  }

  openLessonPreview(lesson: any): void {
    if (!this.canAccessLesson(lesson)) {
      this.toast.info(
        'برای مشاهده این درس باید در دوره ثبت‌نام کنید. درس‌های دارای برچسب "پیش‌نمایش" رایگان هستند.',
        'دسترسی محدود',
        4000,
      );
      return;
    }

    this.selectedLesson.set(lesson);
    this.lessonPreviewVideoUrl.set('');
    this.lessonPreviewError.set('');
    this.showLessonModal.set(true);
    this.lockScroll();

    const fileType = this.getLessonFileType(lesson);
    const isUploadedMedia = fileType === 'video' || fileType === 'audio' || fileType === 'pdf' || fileType === 'image';

    if (lesson._id && isUploadedMedia && (lesson.videoUrl || lesson.fileUrl || lesson.storage?.key)) {
      this.loadLessonPreviewUrl(lesson._id);
    } else {
      // 🔒 لینک خام ذخیره‌سازی هرگز مستقیم استفاده نمی‌شود.
      // به جای آن از اندپوینت محافظت‌شدهٔ بک‌اند (/upload/file/:id) استفاده می‌کنیم
      // که دسترسی (ثبت‌نام/پیش‌نمایش) را بررسی می‌کند.
      const rawUrl = this.getLessonMediaUrl(lesson);
      if (rawUrl) {
        this.lessonPreviewVideoUrl.set(rawUrl);
      }
    }
  }

  private loadLessonPreviewUrl(lectureId: string): void {
    this.isLoadingLessonPreview.set(true);
    this.lessonPreviewError.set('');

    this.videoUploadService.getPlaybackUrl(lectureId).subscribe({
      next: (res: any) => {
        const url = res?.data?.url || res?.url || '';
        if (url && url !== 'null' && url !== 'undefined') {
          this.lessonPreviewVideoUrl.set(url);
          this.startLessonPreviewRefreshTimer(lectureId);
        } else {
          console.warn('[DetailComponent] No playback URL returned from backend for lecture:', lectureId);
          this.lessonPreviewError.set('لینک ویدیو در دسترس نیست.');
        }
        this.isLoadingLessonPreview.set(false);
      },
      error: (err) => {
        console.warn('[DetailComponent] Preview URL error:', err);
        this.lessonPreviewError.set(err?.error?.message || 'خطا در بارگذاری ویدیو.');
        this.isLoadingLessonPreview.set(false);
      },
    });
  }

  private startLessonPreviewRefreshTimer(lectureId: string): void {
    this.clearLessonPreviewTimer();
    if (!isPlatformBrowser(this.platformId)) return;

    this.lessonPreviewRefreshTimer = setInterval(() => {
      if (this.showLessonModal()) {
        this.refreshLessonPreviewUrl(lectureId);
      } else {
        this.clearLessonPreviewTimer();
      }
    }, this.LESSON_PREVIEW_REFRESH_INTERVAL);
  }

  private refreshLessonPreviewUrl(lectureId: string): void {
    this.videoUploadService.refreshPlaybackUrl(lectureId).subscribe({
      next: (res: any) => {
        const url = res?.data?.url || res?.url || '';
        if (url && url !== 'null' && url !== 'undefined') {
          this.lessonPreviewVideoUrl.set(url);
        }
      },
      error: (err) => {
        console.warn('[DetailComponent] Refresh failed:', err);
      },
    });
  }

  onLessonPreviewUrlExpired(): void {
    const lesson = this.selectedLesson();
    if (!lesson || !lesson._id) return;
    this.refreshLessonPreviewUrl(lesson._id);
  }

  private clearLessonPreviewTimer(): void {
    if (this.lessonPreviewRefreshTimer) {
      clearInterval(this.lessonPreviewRefreshTimer);
      this.lessonPreviewRefreshTimer = null;
    }
  }

  closeLessonModal(): void {
    this.showLessonModal.set(false);
    this.selectedLesson.set(null);
    this.lessonPreviewVideoUrl.set('');
    this.lessonPreviewError.set('');
    this.isLoadingLessonPreview.set(false);
    this.clearLessonPreviewTimer();
    this.unlockScroll();
  }

  // ─── ✅ توابع مستقل جهت جلوگیری ۱۰۰٪ از حلقه بی‌نهایت (Recursion Fix) ───

  /** ۱. استخراج خام آدرس بدون صدا زدن هیچ توابعی */
  private getRawLessonUrl(lesson: any): string {
    if (!lesson) return '';
    return String(
      lesson.videoUrl || lesson.fileUrl || lesson.url || lesson.filePath || lesson.contentUrl || ''
    ).trim();
  }

  /** ۲. تشخیص نوع فایل صرفاً از روی فیلدهای درس و URL خام (بدون فراخوانی getLessonMediaUrl) */
  getLessonFileType(lesson: any): 'video' | 'embed' | 'pdf' | 'image' | 'audio' | 'file' {
    if (!lesson) return 'file';

    const explicitType = String(lesson.type || '').toLowerCase();
    if (explicitType === 'video') return 'video';
    if (explicitType === 'pdf') return 'pdf';
    if (explicitType === 'image') return 'image';
    if (explicitType === 'audio') return 'audio';
    if (explicitType === 'embed') return 'embed';

    const rawUrl = this.getRawLessonUrl(lesson).toLowerCase();
    if (!rawUrl) return 'file';

    if (rawUrl.includes('youtube') || rawUrl.includes('youtu.be') || rawUrl.includes('aparat'))
      return 'embed';
    if (
      rawUrl.endsWith('.mp4') ||
      rawUrl.endsWith('.webm') ||
      rawUrl.endsWith('.mkv') ||
      rawUrl.includes('.m3u8')
    )
      return 'video';
    if (rawUrl.endsWith('.pdf')) return 'pdf';
    if (
      rawUrl.endsWith('.png') ||
      rawUrl.endsWith('.jpg') ||
      rawUrl.endsWith('.jpeg') ||
      rawUrl.endsWith('.webp')
    )
      return 'image';
    if (rawUrl.endsWith('.mp3') || rawUrl.endsWith('.wav')) return 'audio';

    return 'file';
  }

  /** ۳. دریافت آدرس نهایی رسانه جهت نمایش/دانلود */
  getLessonMediaUrl(lesson: any): string | null {
    if (!lesson) return null;

    const fileType = this.getLessonFileType(lesson);

    // 🔒 همهٔ فایل‌های آپلودی فقط از طریق اندپوینت
    // محافظت‌شدهٔ بک‌اند در دسترس هستند تا لینک خام ذخیره‌سازی لو نرود.
    if (lesson._id) {
      if (fileType === 'video' || fileType === 'audio') {
        // ویدیو/صوت باید از /upload/stream با توکن استفاده کنند
        return `${environment.apiUrl}/upload/stream/${lesson._id}`;
      }
      if (fileType === 'pdf' || fileType === 'image' || fileType === 'file') {
        // اسناد/تصاویر/فایل‌ها از /upload/file استفاده می‌کنند
        return `${environment.apiUrl}/upload/file/${lesson._id}`;
      }
    }

    // فقط embed عمومی (YouTube/Aparat/Vimeo) و لینک‌های غیرآپلودی مجاز به استفاده مستقیم هستند
    const rawUrl = this.getRawLessonUrl(lesson);
    if (!rawUrl) return null;
    if (fileType === 'video' || fileType === 'embed') {
      // 🔒 اگر لینک خام ذخیره‌سازی است، نباید مستقیم استفاده شود
      if (this.isRawStorageUrl(rawUrl)) {
        return lesson._id ? `${environment.apiUrl}/upload/stream/${lesson._id}` : null;
      }
      return this.resolveMediaUrl(rawUrl);
    }
    return this.resolveMediaUrl(rawUrl);
  }

  /** 🔒 تشخیص لینک خام ویدیو/فایل ذخیره‌سازی (S3/Arvan/Backblaze/R2) که نباید مستقیم نمایش داده شود */
  private isRawStorageUrl(url: string): boolean {
    return isRawMediaUrl(url);
  }

  /** 🔒 جلوگیری از منوی راست‌کلیک (گزینه «ذخیره تصویر/دانلود فایل») روی ویدیو */
  onVideoContextMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  getSafeLessonEmbedUrl(lesson: any): SafeResourceUrl | null {
    const url = this.getLessonMediaUrl(lesson);
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch)
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`,
      );
    const apMatch = url.match(/aparat\.com\/v\/([a-zA-Z0-9_-]+)/);
    if (apMatch)
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.aparat.com/video/video/embed/videohash/${apMatch[1]}/vt/frame?autoplay=1`,
      );
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // ================== UTILS ==================
  private normalizeCourseData(courseData: any): Course {
    if (!courseData) return courseData;
    const instructor = courseData.instructor
      ? { ...courseData.instructor, avatar: this.resolveMediaUrl(courseData.instructor.avatar) }
      : courseData.instructor;
    // 🔒 اگر بک‌اند لینک خام ویدیوی معرفی را حذف کرده، اینجا هم نباید
    // لینک خام دوباره ساخته شود — فقط فلگ promoVideoProtected می‌ماند.
    const promoVideo = courseData.promoVideoProtected
      ? undefined
      : this.resolveMediaUrl(courseData.promoVideo);
    const promoVideoUrl = courseData.promoVideoProtected
      ? undefined
      : this.resolveMediaUrl(courseData.promoVideoUrl);
    return {
      ...courseData,
      thumbnail: this.resolveMediaUrl(courseData.thumbnail),
      promoVideo,
      promoVideoUrl,
      instructor,
    };
  }

  public resolveMediaUrl(raw: unknown): string {
    if (raw == null) return '';
    let url = '';
    if (typeof raw === 'string') url = raw.trim();
    else if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      url = String(o['url'] ?? o['path'] ?? o['secure_url'] ?? o['src'] ?? '').trim();
    }
    if (!url || url === 'null' || url === 'undefined') return '';
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) return '';
    // 🔒 فقط لینک خامِ ویدیو/فایل ممنوع است — تصویر (آواتار/بندانگشتی) عمومی است
    if (this.isRawStorageUrl(url)) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    const base = environment.socketUrl
      ? environment.socketUrl.replace(/\/$/, '')
      : window.location.origin;
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  private lockScroll(): void {
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
  }
  private unlockScroll(): void {
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }

  formatDate(d?: string): string {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  getLevelLabel(level?: string): string {
    switch (level) {
      case 'beginner':
        return 'مبتدی';
      case 'intermediate':
        return 'متوسط';
      case 'advanced':
        return 'پیشرفته';
      case 'all-levels':
        return 'همه سطوح';
      default:
        return level || '';
    }
  }

  // ✅ NEW: Helper methods for Content Items display
  getContentItemIcon(type: string): string {
    const icons: Record<string, string> = {
      'video': 'play_circle',
      'rich-text': 'article',
      'attachment': 'insert_drive_file',
      'external-link': 'link',
      'image': 'image',
      'audio': 'audiotrack',
    };
    return icons[type] || 'play_circle';
  }

  getContentItemTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'video': 'ویدیو',
      'rich-text': 'متن غنی',
      'attachment': 'فایل ضمیمه',
      'external-link': 'لینک خارجی',
      'image': 'تصویر',
      'audio': 'فایل صوتی',
    };
    return labels[type] || 'نامشخص';
  }
}