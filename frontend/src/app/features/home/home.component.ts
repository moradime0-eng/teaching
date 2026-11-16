import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject, of } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs/operators';

import { TiltGlareDirective } from '../../shared/directives/tilt-glare.directive';
import { CourseService } from '../../core/services/course.service';
import { ApiService } from '../../core/services/api.service';
import { SeoService } from '../../core/services/seo.service';

import { CourseCardComponent } from '../../shared/components/course-card/course-card.component';
import { CategoryFilterBarComponent } from '../../shared/components/category-filter-bar/category-filter-bar.component';
import { CategoryIconComponent } from '../../shared/components/category-icon/category-icon.component';


import { LearningPathsShowcaseComponent } from './sections/learning-paths-showcase/learning-paths-showcase.component';
import { NewReleasesComponent } from './sections/new-releases/new-releases.component';
import { FreeCoursesComponent } from './sections/free-courses/free-courses.component';
import { CertificateCtaComponent } from './sections/certificate-cta/certificate-cta.component';
import { TopInstructorsComponent } from './sections/top-instructors/top-instructors.component';
import { TestimonialsComponent } from './sections/testimonials/testimonials.component';
import { LiveStatsComponent } from './sections/live-stats/live-stats.component';
import { FaqComponent } from './sections/faq/faq.component';
import { NewsletterComponent } from './sections/newsletter/newsletter.component';

interface Feature {
  icon: string;
  accent: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    CourseCardComponent,
    CategoryFilterBarComponent,
    CategoryIconComponent,
    LearningPathsShowcaseComponent,
    NewReleasesComponent,
    FreeCoursesComponent,
    CertificateCtaComponent,
    TopInstructorsComponent,
    TestimonialsComponent,
    LiveStatsComponent,
    FaqComponent,
    NewsletterComponent,
    TiltGlareDirective,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  public courseService = inject(CourseService);
  private api = inject(ApiService);
  private seoService = inject(SeoService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  searchQuery = '';
  isLoadingCourses = signal(true);
  isLoadingCategories = signal(true);
  isLoadingFeatures = signal(true);

  // ─── Featured section (with category filter) ───
  /** دوره‌های نمایش‌داده‌شده در سکشن «پرطرفدارترین» (بسته به دسته‌ی انتخابی) */
  readonly featuredCourses = signal<any[]>([]);
  /** دسته‌ی فعال سکشن پیشنهاد ویژه؛ null = «همه دوره‌ها» */
  readonly activeFeaturedCategory = signal<string | null>(null);
  readonly featuredError = signal(false);
  /** تعداد دوره‌های پیش‌فرض (برای آمار هیرو — مستقل از فیلتر) */
  readonly defaultFeaturedCount = signal(0);
  /** نام دسته‌ی فعال برای عنوان سکشن */
  readonly activeFeaturedCategoryName = computed(() => {
    const id = this.activeFeaturedCategory();
    if (!id) return '';
    const cat = this.categories().find((c: any) => c._id === id);
    return cat?.name ?? '';
  });
  /** استریم تغییر دسته‌ی سکشن پیشنهاد ویژه */
  private readonly featuredCategoryRequest$ = new Subject<string | null>();
  /** کش نتیجه‌ی پیش‌فرض برای بازگشت فوری به «همه دوره‌ها» */
  private defaultFeaturedCache: any[] = [];

  features = signal<Feature[]>([]);
  skeletonCourses = Array(4).fill(0);
  skeletonCategories = Array(12).fill(0);

  // ✅ فقط دسته‌بندی‌های اصلی (بدون زیردسته) نمایش داده می‌شوند
  // معیار ریشه: parent ندارد و level آن ۰ (یا نامشخص) است
  readonly categories = computed(() =>
    (this.courseService.categories() ?? []).filter((c: any) => {
      if (!c) return false;
      const hasParent = !!c.parent;
      const level = c.level;
      return (
        !hasParent &&
        (level === 0 || level === null || level === undefined)
      );
    }),
  );

  // تعداد دوره‌های یک دسته = دوره‌های خودش + دوره‌های زیردسته‌هایش
  private countWithChildren(c: any): number {
    const own = c?.totalCourses || 0;
    const kids = Array.isArray(c?.children) ? c.children : [];
    return own + kids.reduce(
      (sum: number, k: any) => sum + (k?.totalCourses || 0),
      0,
    );
  }
  categoryCourses(c: any): number {
    return this.countWithChildren(c);
  }
  readonly totalCourses = computed(() =>
    this.categories().reduce(
      (acc: number, c: any) => acc + this.countWithChildren(c),
      0,
    ),
  );
  readonly categoryCount = computed(() => this.categories().length);
  readonly featuredCount = computed(() => this.defaultFeaturedCount());

  /** تعداد زیردسته‌های یک دسته */
  subCategoryCount(c: any): number {
    return Array.isArray(c?.children) ? c.children.length : 0;
  }

  /** 🎨 آیا دسته‌بندی رنگ پس‌زمینه دارد؟ (رنگ اختیاری است) */
  hasCategoryColor(c: any): boolean {
    const color = typeof c?.color === 'string' ? c.color.trim() : '';
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
  }

  /** 🎨 رنگ دسته‌بندی — از فیلد color بک‌اند؛ در نبود آن، رنگ ثابت برند */
  categoryColor(c: any): string {
    const color = typeof c?.color === 'string' ? c.color.trim() : '';
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)
      ? color
      : '#4f46e5';
  }

  /** 🎨 پس‌زمینه ملایم بر اساس رنگ دسته — اگر رنگی انتخاب نشده باشد، شفاف است */
  categoryTint(c: any): string {
    if (!this.hasCategoryColor(c)) return 'transparent';
    return `color-mix(in srgb, ${this.categoryColor(c)} 14%, transparent)`;
  }

  /** 🎨 گرادیان ملایم بر اساس رنگ دسته — اگر رنگی انتخاب نشده باشد، شفاف است */
  categoryGradient(c: any): string {
    if (!this.hasCategoryColor(c)) return 'transparent';
    const color = this.categoryColor(c);
    return `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #ffffff))`;
  }

  ngOnInit(): void {
    this.seoService.setFullSeo({
      title:
        'آموزشگاه آنلاین همایون - مرجع یادگیری تخصص‌های برنامه‌نویسی و وب',
      description:
        'دسترسی به صدها دوره تخصصی برنامه‌نویسی، طراحی UI/UX و هوش مصنوعی با اساتید برتر کشور و پروژه‌های عملی.',
    });
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.isLoadingCourses.set(true);
    this.isLoadingCategories.set(true);
    this.isLoadingFeatures.set(true);

    this.setupFeaturedStream();

    // اولین بارگذاری سکشن پیشنهاد ویژه (پیش‌فرض = همه دوره‌ها)
    this.loadFeatured(null);

    // ✅ درخت دسته‌بندی‌ها فقط ریشه‌ها را برمی‌گرداند (زیردسته‌ها در children قرار می‌گیرند)
    this.courseService.getCategoryTree().subscribe({
      next: () => this.isLoadingCategories.set(false),
      error: () => this.isLoadingCategories.set(false),
    });

    this.api.get<{ features: Feature[] }>('/home/features').subscribe({
      next: (res) => {
        if (res.success && res.data?.features) {
          this.features.set(res.data.features);
        }
        this.isLoadingFeatures.set(false);
      },
      error: () => {
        this.features.set([
          {
            icon: 'all_inclusive',
            accent: 'violet',
            title: 'دسترسی همیشگی',
            description: 'یک‌بار خرید، دسترسی نامحدود به تمام آپدیت‌های دوره',
          },
          {
            icon: 'code',
            accent: 'cyan',
            title: 'آموزش‌های پروژه‌محور',
            description: 'ساخت پروژه‌های واقعی برای ورود تضمینی به بازار کار',
          },
          {
            icon: 'support_agent',
            accent: 'emerald',
            title: 'پشتیبانی اختصاصی مدرس',
            description: 'رفع اشکال و پاسخ به سوالات شما در طول مسیر یادگیری',
          },
          {
            icon: 'verified',
            accent: 'amber',
            title: 'گواهی پایان دوره معتبر',
            description: 'ارائه مدرک دو زبانه قابل ترجمه و استعلام آنلاین',
          },
        ]);
        this.isLoadingFeatures.set(false);
      },
    });
  }

  // ================================================================
  // FEATURED SECTION · CATEGORY FILTER
  // ================================================================
  /**
   * استریم تغییر دسته‌بندی سکشن پیشنهاد ویژه.
   * از switchMap استفاده می‌کند تا درخواست قبلی در صورت تغییر سریع دسته
   * لغو/نادیده گرفته شود (جلوگیری از race condition).
   */
  private setupFeaturedStream(): void {
    this.featuredCategoryRequest$
      .pipe(
        switchMap((categoryId) => {
          this.featuredError.set(false);
          // درخواست را با startWith(undefined) همراه می‌کنیم تا loading
          // بلافاصله نمایش داده شود و کارت‌های دسته‌ی قبلی پاک شوند
          return this.courseService
            .getCourses({
              category: categoryId ?? undefined,
              sort: 'popular',
              limit: 8,
            })
            .pipe(
              startWith(undefined),
              catchError(() => {
                this.featuredError.set(true);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res === undefined) {
          // حالت loading: کارت‌ها را خالی و اسکلتون را نشان بده
          this.featuredCourses.set([]);
          this.isLoadingCourses.set(true);
          return;
        }
        if (res === null) {
          // خطا
          this.isLoadingCourses.set(false);
          return;
        }
        const list = res.data ?? [];
        this.featuredCourses.set(list);
        this.isLoadingCourses.set(false);

        // نگه‌داشتن نتیجه‌ی پیش‌فرض برای بازگشت فوری به «همه دوره‌ها»
        if (this.activeFeaturedCategory() === null) {
          this.defaultFeaturedCache = list;
          this.defaultFeaturedCount.set(list.length);
        }
      });
  }

  /** رهاسازی درخواست بارگذاری برای دسته‌ی مشخص */
  private loadFeatured(categoryId: string | null): void {
    // بازگشت فوری به «همه دوره‌ها» اگر کش موجود باشد (بدون درخواست شبکه)
    if (categoryId === null && this.defaultFeaturedCache.length > 0) {
      this.featuredCourses.set(this.defaultFeaturedCache);
      this.isLoadingCourses.set(false);
      this.featuredError.set(false);
      return;
    }
    this.featuredCategoryRequest$.next(categoryId);
  }

  /** انتخاب دسته‌بندی جدید در سکشن پیشنهاد ویژه */
  onFeaturedCategoryChange(categoryId: string | null): void {
    if (this.activeFeaturedCategory() === categoryId) return;
    this.activeFeaturedCategory.set(categoryId);
    this.featuredError.set(false);
    this.loadFeatured(categoryId);
  }

  /** تلاش مجدد برای بارگذاری سکشن پیشنهاد ویژه */
  retryFeatured(): void {
    this.featuredError.set(false);
    this.featuredCategoryRequest$.next(this.activeFeaturedCategory());
  }

  /** عنوان پویای سکشن پیشنهاد ویژه بر اساس دسته‌ی انتخابی */
  featuredSectionTitle(): string {
    const name = this.activeFeaturedCategoryName();
    return name
      ? `پرطرفدارترین دوره‌های ${name}`
      : 'پرطرفدارترین دوره‌های این ماه';
  }

  courseTitle(c: any): string {
    return String(c?.title ?? c?.name ?? '');
  }

  onSearchSubmit(): void {
    if (this.searchQuery.trim()) {
      this.router.navigate(['/courses'], {
        queryParams: { search: this.searchQuery.trim() },
      });
    }
  }

  private readonly compactFmt = new Intl.NumberFormat('fa-IR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  faNum(n?: number): string {
    return (n ?? 0).toLocaleString('fa-IR');
  }

  compact(n?: number): string {
    return this.compactFmt.format(n ?? 0);
  }

  featureGradient(accent: string): string {
    const map: Record<string, string> = {
      violet: 'linear-gradient(135deg,#8b5cf6,#d946ef)',
      cyan: 'linear-gradient(135deg,#22d3ee,#3b82f6)',
      emerald: 'linear-gradient(135deg,#34d399,#14b8a6)',
      amber: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
    };
    return map[accent] || map['violet'];
  }

  featureGlow(accent: string): string {
    const map: Record<string, string> = {
      violet: 'rgba(139,92,246,0.4)',
      cyan: 'rgba(34,211,238,0.4)',
      emerald: 'rgba(52,211,153,0.4)',
      amber: 'rgba(251,191,36,0.4)',
    };
    return map[accent] || map['violet'];
  }
}