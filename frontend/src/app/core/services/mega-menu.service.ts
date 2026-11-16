import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { Category } from '../models/category.model';
import { Course } from '../models/course.model';
import {
  MegaCategory,
  MegaSubCategory,
  MegaTopic,
  RecentCategory,
  FeaturedCourse,
} from '../models/mega-menu.model';

/**
 * 🗂️ سرویس حرفه‌ای مگا منوی دسته‌بندی
 * ============================================================
 * قابلیت‌ها:
 * - دریافت داده از API (categories/tree)
 * - کش هوشمند (10 دقیقه)
 * - دسته‌های اخیراً بازدید شده
 * - جستجوی لحظه‌ای
 * - 🚫 بدون Mock Data — داده‌ها مستقیماً از API می‌آیند
 * ============================================================
 */
@Injectable({ providedIn: 'root' })
export class MegaMenuService {
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);
  /** ⚠️ SSR-safe: در رندر سمت سرور localStorage وجود ندارد */
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private readonly CACHE_KEY = 'mega_menu_cache_v2';
  private readonly RECENT_KEY = 'mega_menu_recent_v2';
  // ⚠️ TTL کوتاه‌تر (۲ دقیقه) — چون فقط برای نمایش فوری است و با API اعتبارسنجی می‌شود
  private readonly CACHE_DURATION = 2 * 60 * 1000;
  private readonly MAX_RECENT = 6;

  // ═══════════════════════ Signals ═══════════════════════
  private categoriesRaw = signal<MegaCategory[]>([]);
  private isLoadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);
  private searchQuery = signal('');
  private recentSignal = signal<RecentCategory[]>([]);

  // ═══════════════════════ Public Readonly ═══════════════════════
  readonly categories = this.categoriesRaw.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly recents = this.recentSignal.asReadonly();

  /** دسته‌های فیلتر شده بر اساس جستجو */
  readonly filteredCategories = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const all = this.categoriesRaw();
    if (!query) return all;

    return all
      .map((cat) => ({
        ...cat,
        subcategories: cat.subcategories
          .map((sub) => ({
            ...sub,
            topics: sub.topics.filter((t) => t.name.toLowerCase().includes(query)),
          }))
          .filter((sub) => sub.name.toLowerCase().includes(query) || sub.topics.length > 0),
      }))
      .filter((cat) => cat.name.toLowerCase().includes(query) || cat.subcategories.length > 0);
  });

  readonly trendingCategories = computed(() => this.categoriesRaw().filter((c) => c.isTrending));

  readonly newCategories = computed(() => this.categoriesRaw().filter((c) => c.isNew));

  readonly featuredCategories = computed(() => this.categoriesRaw().filter((c) => c.isFeatured));

  readonly totalCoursesCount = computed(() =>
    this.categoriesRaw().reduce((sum, c) => sum + c.courseCount, 0),
  );

  readonly hasResults = computed(() => this.filteredCategories().length > 0);

  constructor() {
    this.loadFromCache();
    this.loadRecents();
  }

  // ═══════════════════════ Public API ═══════════════════════

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  currentQuery(): string {
    return this.searchQuery();
  }

  /**
   * بارگذاری دیتای مگامنو از API
   * 🚫 بدون Mock Data — اگر API خالی برگرداند، آرایه خالی برمی‌گردد
   *
   * ⚠️ FIX: کش localStorage فقط به‌عنوان «نمایش فوری» استفاده می‌شود و
   * همیشه در پس‌زمینه با API اعتبارسنجی می‌گردد.
   * قبلاً اگر کش وجود داشت، API اصلاً صدا زده نمی‌شد → دسته‌بندی‌های
   * حذف‌شده از پنل ادمین تا ۱۰ دقیقه باقی می‌ماندند.
   */
  loadMegaMenu(forceRefresh = false): Observable<MegaCategory[]> {
    const cached = forceRefresh ? null : this.getFromCache();

    // نمایش فوری داده کش (بدون انتظار برای API)
    if (cached && cached.length > 0) {
      this.categoriesRaw.set(cached);
    }

    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    // First load category highlights, then load categories
    return this.loadCategoryHighlights().pipe(
      switchMap(() => this.api.get<Category[]>('/categories/tree')),
      map((res: any) => {
        if (res.success && res.data && res.data.length > 0) {
          return this.transformToMegaMenu(res.data);
        }
        // ⚠️ FIX: پاسخ خالی از API یعنی دیتابیس خالی است → کش قدیمی نباید نمایش داده شود
        return [];
      }),
      tap((data) => {
        this.categoriesRaw.set(data);
        if (data.length > 0) {
          this.saveToCache(data);
        } else {
          // پاسخ خالی → کش قدیمی را پاک کن تا داده منقضی باقی نماند
          this.clearCache();
        }
        this.isLoadingSignal.set(false);
      }),
      catchError((err) => {
        console.error('MegaMenu API error:', err?.message);
        this.errorSignal.set('خطا در بارگذاری دسته‌بندی‌ها');
        this.isLoadingSignal.set(false);
        // ⚠️ در صورت خطای شبکه، داده کش حفظ می‌شود (offline-friendly)
        if (!cached || cached.length === 0) {
          this.categoriesRaw.set([]);
        }
        return of(cached && cached.length > 0 ? cached : []);
      }),
    );
  }

  /**
   * دریافت دوره‌های پیشنهادی برای یک دسته
   * 🚫 بدون Mock Data — از API واقعی خوانده می‌شود
   * ⚠️ روت `/courses/featured` در بک‌اند وجود ندارد (404)؛
   * از `/search/courses` با فیلتر دسته‌بندی استفاده می‌شود.
   */
  getFeaturedCourses(categorySlug: string): Observable<FeaturedCourse[]> {
    return this.api
      .getPaginated<Course>('/search/courses', {
        category: categorySlug,
        limit: 6,
        sort: 'popular',
      })
      .pipe(
        map((res) =>
          (res.data || []).map((course) => ({
            _id: course._id,
            title: course.title,
            slug: course.slug,
            thumbnail: course.thumbnail,
            price: course.currentPrice ?? course.price,
            discountPrice: course.discountPrice,
            rating: course.averageRating ?? course.rating,
            studentsCount: course.totalStudents,
            instructor: course.instructor?.fullName || '',
            categorySlug,
          })),
        ),
        catchError(() => {
          console.warn('Failed to load featured courses');
          return of([]);
        }),
      );
  }

  // ═══════════════════════ Data Transform ═══════════════════════
  // تبدیل ساختار درختی Category از API به MegaCategory

  private transformToMegaMenu(categories: Category[]): MegaCategory[] {
    // Load dynamic highlights from API (will be set via loadCategoryHighlights)
    const trendingSlugs = this.trendingSlugsCache;
    const newSlugs = this.newSlugsCache;
    const featuredSlugs = this.featuredSlugsCache;

    return categories
      .filter((cat) => cat.level === 0 && cat.isActive)
      .map((cat, index) => {
        const style = this.getCategoryStyle(index, cat.slug);
        // children از API به صورت تو در تو (nested tree) می‌آید
        const children: Category[] = (cat as any).children || [];

        return {
          _id: cat._id,
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon || style.icon,
          iconType: cat.iconType || 'material',
          customIconUrl: cat.customIconUrl || '',
          // 🎨 رنگ ذخیره‌شده در دیتابیس اولویت دارد؛ در نبودش از پالت پیش‌فرض استفاده می‌شود
          color: cat.color || style.color,
          gradient: style.gradient,
          courseCount: cat.totalCourses || 0,
          isTrending: trendingSlugs.includes(cat.slug),
          isNew: newSlugs.includes(cat.slug),
          isFeatured: featuredSlugs.includes(cat.slug),
          subcategories: children
            .filter((child: any) => child.isActive)
            .map((child: any) => ({
              _id: child._id,
              name: child.name,
              slug: child.slug,
              icon: child.icon || '',
              iconType: child.iconType || 'material',
              customIconUrl: child.customIconUrl || '',
              courseCount: child.totalCourses || 0,
              isPopular: (child.totalCourses || 0) > 30,
              topics: this.extractTopics(child),
            })),
        };
      });
  }

  // Cache for dynamic highlights
  private trendingSlugsCache: string[] = [];
  private newSlugsCache: string[] = [];
  private featuredSlugsCache: string[] = [];

  /** Load category highlights (trending, new, featured) from API */
  loadCategoryHighlights(): Observable<{ trending: string[]; new: string[]; featured: string[] }> {
    return this.api.get<{ trending: string[]; new: string[]; featured: string[] }>('/home/category-highlights').pipe(
      map((res) => {
        if (res.success && res.data) {
          this.trendingSlugsCache = res.data.trending || [];
          this.newSlugsCache = res.data.new || [];
          this.featuredSlugsCache = res.data.featured || [];
          return res.data;
        }
        return { trending: [], new: [], featured: [] };
      }),
      catchError((err) => {
        console.warn('Failed to load category highlights:', err?.message);
        return of({ trending: [], new: [], featured: [] });
      }),
    );
  }

  /**
   * استخراج topics از زیردسته
   * اگر زیردسته children داشته باشد آن‌ها را به عنوان topic برمی‌گرداند
   */
  private extractTopics(subcategory: Category): MegaTopic[] {
    if (subcategory.children && subcategory.children.length > 0) {
      return subcategory.children
        .filter((child) => child.isActive)
        .map((child) => ({
          _id: child._id,
          name: child.name,
          slug: child.slug,
          courseCount: child.totalCourses || 0,
        }));
    }
    return [];
  }

  private getCategoryStyle(
    index: number,
    slug?: string,
  ): { color: string; gradient: string; icon: string } {
    const styleMap: Record<string, { color: string; gradient: string; icon: string }> = {
      'ai-machine-learning': {
        color: '#8b5cf6',
        gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        icon: 'psychology',
      },
      programming: {
        color: '#3b82f6',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
        icon: 'code',
      },
    };

    if (slug && styleMap[slug]) return styleMap[slug];

    const styles = [
      {
        color: '#8b5cf6',
        gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
        icon: 'psychology',
      },
      { color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)', icon: 'code' },
      { color: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4, #22d3ee)', icon: 'computer' },
      { color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #34d399)', icon: 'language' },
      { color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #fbbf24)', icon: 'business' },
      {
        color: '#ef4444',
        gradient: 'linear-gradient(135deg, #ef4444, #f87171)',
        icon: 'account_balance',
      },
      {
        color: '#ec4899',
        gradient: 'linear-gradient(135deg, #ec4899, #f472b6)',
        icon: 'self_improvement',
      },
      { color: '#f97316', gradient: 'linear-gradient(135deg, #f97316, #fb923c)', icon: 'palette' },
      {
        color: '#6366f1',
        gradient: 'linear-gradient(135deg, #6366f1, #818cf8)',
        icon: 'engineering',
      },
      { color: '#14b8a6', gradient: 'linear-gradient(135deg, #14b8a6, #2dd4bf)', icon: 'science' },
      {
        color: '#a855f7',
        gradient: 'linear-gradient(135deg, #a855f7, #c084fc)',
        icon: 'child_care',
      },
    ];
    return styles[index % styles.length];
  }

  // ═══════════════════════ Cache ═══════════════════════

  private saveToCache(data: MegaCategory[]): void {
    if (!this.isBrowser) return;
    try {
      const payload = { data, timestamp: Date.now() };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  private getFromCache(): MegaCategory[] | null {
    if (!this.isBrowser) return null;
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > this.CACHE_DURATION) {
        localStorage.removeItem(this.CACHE_KEY);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  private loadFromCache(): void {
    const cached = this.getFromCache();
    if (cached) this.categoriesRaw.set(cached);
  }

  /**
   * پاک کردن کش دسته‌بندی‌ها از localStorage
   * وقتی API پاسخ خالی می‌دهد (دیتابیس خالی شده) صدا زده می‌شود.
   */
  clearCache(): void {
    if (this.isBrowser) {
      try {
        localStorage.removeItem(this.CACHE_KEY);
      } catch {
        /* ignore */
      }
    }
    this.categoriesRaw.set([]);
  }

  // ═══════════════════════ Recents ═══════════════════════

  private loadRecents(): void {
    if (!this.isBrowser) return;
    try {
      const raw = localStorage.getItem(this.RECENT_KEY);
      if (raw) this.recentSignal.set(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }

  getRecentCategories(): RecentCategory[] {
    return this.recentSignal();
  }

  addRecentCategory(cat: {
    _id: string;
    name: string;
    slug: string;
    icon: string;
    gradient?: string;
  }): void {
    try {
      const recents = this.recentSignal().filter((r) => r._id !== cat._id);
      recents.unshift({ ...cat, visitedAt: Date.now() });
      const trimmed = recents.slice(0, this.MAX_RECENT);
      this.recentSignal.set(trimmed);
      if (this.isBrowser) {
        localStorage.setItem(this.RECENT_KEY, JSON.stringify(trimmed));
      }
    } catch {
      /* ignore */
    }
  }

  clearRecents(): void {
    this.recentSignal.set([]);
    if (this.isBrowser) {
      try {
        localStorage.removeItem(this.RECENT_KEY);
      } catch {
        /* ignore */
      }
    }
  }
}
