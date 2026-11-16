import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  Inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CourseService } from '../../../core/services/course.service';
import { ApiService } from '../../../core/services/api.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';
import { CourseCardComponent } from '../../../shared/components/course-card/course-card.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { FaDurationSecondsPipe } from '../../../shared/pipes/fa-duration-seconds.pipe';
import { environment } from '../../../../environments/environment.development';

interface QuickFilter {
  key: string;
  label: string;
  icon: string;
  field: string;
  value: any;
  resetValue: any;
}

interface SortOption {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    CourseCardComponent,
    PaginationComponent,
    TomanPipe,
    RatingStarsComponent,
    FaDurationSecondsPipe,
  ],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent implements OnInit, OnDestroy {
  // برای استفاده از Math در تمپلیت
  Math = Math;

  courses: Course[] = [];
  totalPages = 1;
  currentPage = 1;
  totalCourses = 0;
  isLoading = false;
  viewMode: 'grid' | 'list' = 'grid';
  isMobileFilterOpen = false;
  isScrolled = false;
  isBrowser = false;
  scrollPercent = 0;
  showBackToTop = false;
  isSortMenuOpen = false;
  showSearchSuggestions = false;

  // دسته‌بندی‌های اصلی (فقط ریشه)
  parentCategories: Category[] = [];
  // زیردسته‌های دسته انتخاب شده
  subcategories: Category[] = [];
  // آیا در حال بارگذاری زیردسته‌ها هستیم
  isLoadingSubcategories = false;

  // جستجوی هوشمند
  recentSearches: string[] = [];
  popularSearches = signal<string[]>([]);
  isLoadingPopularSearches = signal(true);

  // وضعیت باز/بسته آکاردئون فیلترها
  openSections: Record<string, boolean> = {
    category: true,
    level: true,
    price: true,
    rating: false,
  };

  filters: any = {
    category: '',
    subCategory: '',
    level: '',
    sort: 'newest',
    search: '',
    minPrice: '',
    maxPrice: '',
    rating: '',
    isFree: false,
  };

  levelLabels: Record<string, string> = {
    beginner: 'مقدماتی',
    intermediate: 'متوسط',
    advanced: 'پیشرفته',
    'all-levels': 'همه سطح‌ها',
  };

  sortOptions: SortOption[] = [
    { value: 'newest', label: 'جدیدترین', icon: 'schedule' },
    { value: 'popular', label: 'محبوب‌ترین', icon: 'local_fire_department' },
    { value: 'rating', label: 'بالاترین امتیاز', icon: 'star' },
    { value: 'price_low', label: 'قیمت: کم به زیاد', icon: 'trending_up' },
    { value: 'price_high', label: 'قیمت: زیاد به کم', icon: 'trending_down' },
  ];

  quickFilters: QuickFilter[] = [
    { key: 'free', label: 'رایگان', icon: 'money_off', field: 'isFree', value: true, resetValue: false },
    { key: 'popular', label: 'محبوب‌ترین', icon: 'local_fire_department', field: 'sort', value: 'popular', resetValue: 'newest' },
    { key: 'top-rated', label: 'برترین امتیاز', icon: 'star', field: 'sort', value: 'rating', resetValue: 'newest' },
    { key: 'cheapest', label: 'ارزان‌ترین', icon: 'trending_up', field: 'sort', value: 'price_low', resetValue: 'newest' },
  ];

  ratingOptions = [4.5, 4, 3.5, 3];

  stats = signal<Array<{ icon: string; value: string; label: string }>>([]);
  isLoadingStats = signal(true);

  private searchSubject = new Subject<string>();

  constructor(
    public courseService: CourseService,
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.loadParentCategories();
    this.loadPopularSearches();
    this.loadStats();

    this.route.queryParams.subscribe((params) => {
      this.filters = {
        category: params['category'] || '',
        subCategory: params['subCategory'] || params['sub'] || '',
        level: params['level'] || '',
        sort: params['sort'] || 'newest',
        search: params['search'] || '',
        minPrice: params['minPrice'] || '',
        maxPrice: params['maxPrice'] || '',
        // تبدیل به عدد تا مقایسه === با گزینه‌های عددی فیلتر امتیاز درست کار کند
        rating: params['rating'] ? Number(params['rating']) : '',
        isFree: params['isFree'] === 'true',
      };
      this.currentPage = parseInt(params['page']) || 1;

      if (this.filters.category) {
        this.loadSubcategories(this.filters.category, false);
      } else {
        this.subcategories = [];
      }

      this.loadCourses();
    });

    if (this.isBrowser) {
      const savedView = localStorage.getItem('catalog-view');
      if (savedView === 'list' || savedView === 'grid') {
        this.viewMode = savedView;
      }
      const rs = localStorage.getItem('catalog-recent-searches');
      if (rs) {
        try {
          this.recentSearches = JSON.parse(rs).slice(0, 5);
        } catch {
          this.recentSearches = [];
        }
      }
    }

    this.searchSubject.pipe(debounceTime(450), distinctUntilChanged()).subscribe(() => {
      this.applyFilter();
    });
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  /** بارگذاری جستجوهای محبوب از API */
  loadPopularSearches(): void {
    this.isLoadingPopularSearches.set(true);
    this.api.get<{ popularSearches: string[] }>('/home/popular-searches').subscribe({
      next: (res) => {
        if (res.success && res.data?.popularSearches) {
          this.popularSearches.set(res.data.popularSearches);
        }
        this.isLoadingPopularSearches.set(false);
      },
      error: () => {
        // Fallback to default searches if API fails
        this.popularSearches.set(['برنامه‌نویسی', 'طراحی سایت', 'پایتون', 'React', 'دیجیتال مارکتینگ']);
        this.isLoadingPopularSearches.set(false);
      },
    });
  }

  /** بارگذاری آمار پلتفرم از API */
  loadStats(): void {
    this.isLoadingStats.set(true);
    this.api.get<{ totalStudents: number; totalCourses: number; totalCertificates: number; totalHours: number; totalInstructors: number; totalCategories: number }>('/home/stats').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const d = res.data;
          this.stats.set([
            { icon: 'school', value: this.compactFa(d.totalCourses) + '+', label: 'دوره آموزشی' },
            { icon: 'people', value: this.compactFa(d.totalStudents) + '+', label: 'دانشجوی فعال' },
            { icon: 'workspace_premium', value: this.compactFa(d.totalCertificates) + '+', label: 'گواهینامه صادرشده' },
            { icon: 'schedule', value: this.compactFa(d.totalHours) + '+', label: 'ساعت آموزش' },
          ]);
        }
        this.isLoadingStats.set(false);
      },
      error: () => {
        // Fallback to default stats if API fails
        this.stats.set([
          { icon: 'school', value: '۵۰۰+', label: 'دوره آموزشی' },
          { icon: 'people', value: '۲۰,۰۰۰+', label: 'دانشجوی فعال' },
          { icon: 'workspace_premium', value: '۹۸٪', label: 'رضایت کاربران' },
        ]);
        this.isLoadingStats.set(false);
      },
    });
  }

  /** بارگذاری دسته‌بندی‌های اصلی (فقط ریشه - سطح ۰) */
  loadParentCategories(): void {
    this.courseService.getParentCategories().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.parentCategories = res.data.filter(
            (cat: Category) => cat.level === 0 && cat.parent === null,
          );
        }
      },
    });
  }

  /** بارگذاری زیردسته‌های یک دسته اصلی */
  loadSubcategories(categorySlugOrId: string, resetSubCategory = true): void {
    if (!categorySlugOrId) {
      this.subcategories = [];
      return;
    }

    this.isLoadingSubcategories = true;

    const parentCat = this.parentCategories.find(
      (c) => c._id === categorySlugOrId || c.slug === categorySlugOrId,
    );

    if (parentCat) {
      this.courseService.getSubcategories(parentCat._id).subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.subcategories = res.data.filter((c: Category) => c.level === 1);
          } else {
            this.subcategories = [];
          }
          this.isLoadingSubcategories = false;
        },
        error: () => {
          this.subcategories = [];
          this.isLoadingSubcategories = false;
        },
      });
    } else {
      this.subcategories = [];
      this.isLoadingSubcategories = false;
    }

    if (resetSubCategory) {
      this.filters.subCategory = '';
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!this.isBrowser) return;
    const y = window.scrollY;
    this.isScrolled = y > 100;
    this.showBackToTop = y > 500;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    this.scrollPercent = max > 0 ? Math.min(100, Math.max(0, (y / max) * 100)) : 0;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (this.isSortMenuOpen && !target.closest('.sort-dropdown')) {
      this.isSortMenuOpen = false;
    }
  }

  loadCourses(): void {
    this.isLoading = true;
    this.courseService
      .getCourses({ ...this.filters, page: this.currentPage, limit: 12 })
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.courses = res.data;
            if (res.meta) {
              this.totalPages = res.meta.totalPages;
              this.totalCourses = (res.meta as any).total || res.data.length;
            }
          }
          this.isLoading = false;
        },
        error: () => {
          this.isLoading = false;
        },
      });
  }

  applyFilter(): void {
    if (this.filters.search) {
      this.saveRecentSearch(this.filters.search);
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.filters, page: 1 },
      queryParamsHandling: 'merge',
    });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
    if (this.isBrowser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  clearAllFilters(): void {
    this.filters = {
      category: '',
      subCategory: '',
      level: '',
      sort: 'newest',
      search: '',
      minPrice: '',
      maxPrice: '',
      rating: '',
      isFree: false,
    };
    this.subcategories = [];
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  clearFilter(key: string): void {
    if (key === 'sort') {
      this.filters.sort = 'newest';
    } else if (key === 'price') {
      this.filters.minPrice = '';
      this.filters.maxPrice = '';
    } else if (key === 'isFree') {
      this.filters.isFree = false;
    } else if (key === 'rating') {
      this.filters.rating = '';
    } else {
      this.filters[key] = '';
    }

    if (key === 'category') {
      this.filters.subCategory = '';
      this.subcategories = [];
    }
    this.applyFilter();
  }

  hasActiveFilters(): boolean {
    return !!(
      this.filters.category ||
      this.filters.subCategory ||
      this.filters.level ||
      this.filters.search ||
      this.filters.minPrice ||
      this.filters.maxPrice ||
      this.filters.rating ||
      this.filters.isFree
    );
  }

  getActiveFilterCount(): number {
    let count = 0;
    if (this.filters.category) count++;
    if (this.filters.subCategory) count++;
    if (this.filters.level) count++;
    if (this.filters.search) count++;
    if (this.filters.minPrice || this.filters.maxPrice) count++;
    if (this.filters.rating) count++;
    if (this.filters.isFree) count++;
    return count;
  }

  getCategoryName(id: string): string {
    const parentCat = this.parentCategories.find((c: any) => c._id === id);
    if (parentCat) return parentCat.name;
    const subCat = this.subcategories.find((c: any) => c._id === id);
    if (subCat) return subCat.name;
    const cat = this.courseService.categories().find((c: any) => c._id === id);
    return cat ? cat.name : '';
  }

  /** هنگام تغییر دسته اصلی */
  onCategoryChange(): void {
    this.loadSubcategories(this.filters.category, true);
    this.applyFilter();
  }

  /** هنگام تغییر زیردسته */
  onSubCategoryChange(): void {
    this.applyFilter();
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    if (this.isBrowser) {
      localStorage.setItem('catalog-view', mode);
    }
  }

  toggleMobileFilter(): void {
    this.isMobileFilterOpen = !this.isMobileFilterOpen;
    if (this.isBrowser) {
      document.body.style.overflow = this.isMobileFilterOpen ? 'hidden' : '';
    }
  }

  toggleSection(key: string): void {
    this.openSections[key] = !this.openSections[key];
  }

  /** ------- جستجوی هوشمند ------- */
  onSearchInput(): void {
    this.searchSubject.next(this.filters.search);
  }

  onSearchFocus(): void {
    this.showSearchSuggestions = true;
  }

  onSearchBlur(): void {
    setTimeout(() => (this.showSearchSuggestions = false), 150);
  }

  selectSearchTerm(term: string): void {
    this.filters.search = term;
    this.showSearchSuggestions = false;
    this.applyFilter();
  }

  saveRecentSearch(term: string): void {
    if (!term?.trim() || !this.isBrowser) return;
    this.recentSearches = [term, ...this.recentSearches.filter((t) => t !== term)].slice(0, 5);
    localStorage.setItem('catalog-recent-searches', JSON.stringify(this.recentSearches));
  }

  clearRecentSearches(event: Event): void {
    event.stopPropagation();
    this.recentSearches = [];
    if (this.isBrowser) localStorage.removeItem('catalog-recent-searches');
  }

  /** ------- مرتب‌سازی سفارشی ------- */
  toggleSortMenu(event: Event): void {
    event.stopPropagation();
    this.isSortMenuOpen = !this.isSortMenuOpen;
  }

  selectSort(value: string): void {
    this.filters.sort = value;
    this.isSortMenuOpen = false;
    this.applyFilter();
  }

  getCurrentSortLabel(): string {
    return this.sortOptions.find((s) => s.value === this.filters.sort)?.label || 'مرتب‌سازی';
  }

  getCurrentSortIcon(): string {
    return this.sortOptions.find((s) => s.value === this.filters.sort)?.icon || 'swap_vert';
  }

  /** ------- فیلترهای سریع ------- */
  isQuickFilterActive(qf: QuickFilter): boolean {
    return this.filters[qf.field] === qf.value;
  }

  toggleQuickFilter(qf: QuickFilter): void {
    this.filters[qf.field] = this.isQuickFilterActive(qf) ? qf.resetValue : qf.value;
    this.applyFilter();
  }

  /** ------- امتیاز و قیمت ------- */
  selectRating(r: number): void {
    this.filters.rating = this.filters.rating === r ? '' : r;
    this.applyFilter();
  }

  applyPriceFilter(): void {
    this.applyFilter();
  }

  /** هنگام فعال کردن «فقط دوره‌های رایگان»، بازه قیمت پاک می‌شود تا فیلترها متناقض نشوند */
  onFreeToggle(): void {
    if (this.filters.isFree) {
      this.filters.minPrice = '';
      this.filters.maxPrice = '';
    }
    this.applyFilter();
  }

  setPricePreset(min: string, max: string): void {
    this.filters.minPrice = min;
    this.filters.maxPrice = max;
    this.filters.isFree = false;
    this.applyFilter();
  }

  scrollToTop(): void {
    if (this.isBrowser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (!this.isBrowser) return;

    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      const searchInput = document.getElementById('catalog-search') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    }
    if (event.key === 'Escape') {
      if (this.isMobileFilterOpen) this.toggleMobileFilter();
      if (this.isSortMenuOpen) this.isSortMenuOpen = false;
      if (this.showSearchSuggestions) this.showSearchSuggestions = false;
    }
  }

  /** تبدیل اعداد به ارقام فارسی با جداکننده هزارگان */
  faNum(value: number | string): string {
    const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const grouped = String(value ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return grouped.replace(/[0-9]/g, (d) => fa[+d]);
  }

  /** فرمت فشرده اعداد بزرگ (مثلاً ۱۹۰۰ -> ۱.۹هزار) */
  compactFa(value: number): string {
    if (!value && value !== 0) return '۰';
    if (value >= 1000) {
      const k = Math.round(value / 100) / 10;
      const str = Number.isInteger(k) ? `${k}` : k.toFixed(1);
      return this.faNum(str) + 'هزار';
    }
    return this.faNum(value);
  }

  get skeletonArray(): number[] {
    return Array(8)
      .fill(0)
      .map((_, i) => i);
  }

  trackByCourse(index: number, course: Course): string {
    return (course as any)._id || index.toString();
  }

  getCourseImage(course: any): string {
    const img =
      course.thumbnail ||
      course.image ||
      course.coverImage ||
      course.imageUrl ||
      '/assets/images/default-course.svg';
    return this.resolveMediaUrl(img);
  }

  getCourseDescription(course: any): string {
    const raw = course.shortDescription || course.description || course.summary || '';
    return this.stripHtml(raw);
  }

  /** حذف تگ‌های HTML و برگرداندن متن خالص (توضیحات از ویرایشگر غنی می‌آیند) */
  private stripHtml(html: string): string {
    if (!html) return '';
    let text: string;
    if (typeof document !== 'undefined') {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      text = temp.textContent || temp.innerText || '';
    } else {
      // SSR: بدون DOM — حذف تگ‌ها با regex و رمزگشایی انتیتی‌های پایه
      text = html
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'");
    }
    return text.trim().replace(/\s+/g, ' ');
  }

  getCourseCategoryName(course: any): string {
    if (!course.category) return '';
    if (typeof course.category === 'string') {
      return this.getCategoryName(course.category);
    }
    return course.category.name || '';
  }

  getInstructorName(course: any): string {
    if (!course.instructor) return course.instructorName || '';
    if (typeof course.instructor === 'string') return course.instructor;
    return course.instructor.fullName || course.instructor.name || '';
  }

  getInstructorAvatar(course: any): string {
    let url: string;
    if (course.instructor && typeof course.instructor === 'object') {
      url = course.instructor.avatar || course.instructor.image || course.instructor.profileImage || '';
    } else {
      url = course.instructorAvatar || '';
    }
    return url ? this.resolveMediaUrl(url) : '/assets/images/default-avatar.svg';
  }

  /** تبدیل مسیر نسبی به آدرس کامل سرور */
  private resolveMediaUrl(raw: string): string {
    if (!raw) return '/assets/images/default-course.svg';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('//')) return 'https:' + raw;
    const base = environment.socketUrl.replace(/\/$/, '');
    return raw.startsWith('/') ? base + raw : base + '/' + raw;
  }

  getRating(course: any): number {
    return course.averageRating || (typeof course.rating === 'number' ? course.rating : 0);
  }

  getReviewsCount(course: any): number {
    return (
      course.totalReviews ||
      course.reviewsCount ||
      course.reviewCount ||
      0
    );
  }

  getStudentsCount(course: any): number {
    return course.totalStudents || course.studentsCount || course.enrollmentCount || 0;
  }

  getLessonsCount(course: any): number {
    return course.totalLectures || course.lessonsCount || course.totalLessons || 0;
  }

  getPrice(course: any): number {
    // استفاده از pricing محاسبه شده توسط سرور
    if (course.pricing?.currentPrice !== undefined) return course.pricing.currentPrice;
    if (course.currentPrice !== undefined && course.currentPrice > 0) return course.currentPrice;
    if (course.discountPrice && course.discountPrice > 0) return course.discountPrice;
    return course.price || 0;
  }

  getOriginalPrice(course: any): number {
    if (course.pricing?.originalPrice !== undefined) return course.pricing.originalPrice;
    return course.price || 0;
  }

  getDiscountPercent(course: any): number {
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

  isFreeCourse(course: any): boolean {
    if (course.isFree) return true;
    const price = this.getPrice(course);
    return !price || price === 0;
  }

  getLevelLabel(course: any): string {
    return this.levelLabels[course.level] || course.level || '';
  }

  isCourseNew(course: any): boolean {
    if (course.isNew) return true;
    if (course.createdAt) {
      const created = new Date(course.createdAt).getTime();
      const days = (Date.now() - created) / (1000 * 60 * 60 * 24);
      return days <= 14;
    }
    return false;
  }

  /** لینک صفحه جزئیات دوره */
  getCourseUrl(course: any): any[] {
    return ['/course', course.slug || course._id];
  }
}