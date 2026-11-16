// frontend/src/app/features/learning-paths/learning-paths-catalog/learning-paths-catalog.component.ts

import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  PLATFORM_ID,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

import {
  LearningPathService,
  ILearningPath,
  IPaginationMeta,
} from '../../../services/learning-path.service';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { FaNumPipe } from '../../../shared/pipes/fa-num.pipe';
import { ToastService } from '../../../core/services/toast.service';

type DifficultyFilter = 'all' | 'beginner' | 'intermediate' | 'advanced' | 'mixed';
type SortOption = '-createdAt' | 'displayOrder' | '-enrolledStudents' | '-totalCourses' | 'title';

interface DifficultyMeta {
  label: string;
  color: string;
  bg: string;
  icon: string;
}

interface CatalogQuery {
  page: number;
  search: string;
  difficulty?: DifficultyFilter;
  hasCertificate: boolean;
  sort: SortOption;
}

@Component({
  selector: 'app-learning-paths-catalog',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    DurationPipe,
    FaNumPipe,
  ],
  templateUrl: './learning-paths-catalog.component.html',
  styleUrls: ['./learning-paths-catalog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningPathsCatalogComponent implements OnInit, OnDestroy {
  private lpService = inject(LearningPathService);
  private platformId = inject(PLATFORM_ID);
  private toast = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  // ══════════════════════════════════════════
  //  State
  // ══════════════════════════════════════════
  readonly paths = signal<ILearningPath[]>([]);
  readonly loading = signal(true);
  readonly totalCount = signal(0);
  readonly error = signal(false);

  readonly searchQuery = signal('');
  readonly selectedDifficulty = signal<DifficultyFilter>('all');
  readonly requireCertificate = signal(false);
  readonly sortBy = signal<SortOption>('-createdAt');
  readonly page = signal(1);
  readonly pageSize = 12;
  readonly pagination = signal<IPaginationMeta | null>(null);

  private readonly query = computed<CatalogQuery>(() => ({
    page: this.page(),
    search: this.searchQuery().trim(),
    difficulty: this.selectedDifficulty() === 'all' ? undefined : this.selectedDifficulty(),
    hasCertificate: this.requireCertificate(),
    sort: this.sortBy(),
  }));

  // ══════════════════════════════════════════
  //  Derived
  // ══════════════════════════════════════════
  readonly totalPages = computed(() => {
    const p = this.pagination();
    if (p && p.pages > 0) return p.pages;
    return Math.max(1, Math.ceil(this.totalCount() / this.pageSize));
  });

  readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.selectedDifficulty() !== 'all' ||
      this.requireCertificate(),
  );

  readonly activeFiltersCount = computed(() => {
    let c = 0;
    if (this.searchQuery().trim()) c++;
    if (this.selectedDifficulty() !== 'all') c++;
    if (this.requireCertificate()) c++;
    return c;
  });

  readonly rangeStart = computed(() =>
    this.totalCount() === 0 ? 0 : (this.page() - 1) * this.pageSize + 1,
  );
  readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize, this.totalCount()));

  readonly pageNumbers = computed<Array<number | 'gap'>>(() => {
    const total = this.totalPages();
    const current = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const out: Array<number | 'gap'> = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) out.push('gap');
    for (let i = start; i <= end; i++) out.push(i);
    if (end < total - 1) out.push('gap');
    out.push(total);
    return out;
  });

  // ══════════════════════════════════════════
  //  Metadata — ✅ FIXED TYPO
  // ══════════════════════════════════════════
  readonly difficultyMeta: Record<string, DifficultyMeta> = {
    beginner: { label: 'مبتدی', color: '#059669', bg: '#d1fae5', icon: 'rocket_launch' },
    intermediate: { label: 'متوسط', color: '#d97706', bg: '#fef3c7', icon: 'bolt' },
    advanced: { label: 'پیشرفته', color: '#dc2626', bg: '#fee2e2', icon: 'military_tech' },
    mixed: { label: 'ترکیبی', color: '#7c3aed', bg: '#ede9fe', icon: 'auto_awesome' },
  };

  readonly difficulties: Array<{
    key: DifficultyFilter;
    label: string;
    color: string;
    icon?: string;
  }> = [
    { key: 'all', label: 'همه مسیرها', color: '#1b1710', icon: 'apps' },
    { key: 'beginner', label: 'مبتدی', color: '#059669', icon: 'rocket_launch' },
    { key: 'intermediate', label: 'متوسط', color: '#d97706', icon: 'bolt' },
    { key: 'advanced', label: 'پیشرفته', color: '#dc2626', icon: 'military_tech' },
    { key: 'mixed', label: 'ترکیبی', color: '#7c3aed', icon: 'auto_awesome' },
  ];

  readonly sortOptions: Array<{ value: SortOption; label: string; icon: string }> = [
    { value: '-createdAt', label: 'جدیدترین', icon: 'schedule' },
    { value: 'displayOrder', label: 'پیشنهاد همایون', icon: 'auto_awesome' },
    { value: '-enrolledStudents', label: 'پرطرفدارترین', icon: 'local_fire_department' },
    { value: '-totalCourses', label: 'حجمی‌ترین', icon: 'library_books' },
    { value: 'title', label: 'الفبایی (الف - ی)', icon: 'sort_by_alpha' },
  ];

  readonly heroStats = signal<{
    totalPaths: number;
    totalCourses: number;
    totalDuration: number;
    certifiedPaths: number;
  }>({ totalPaths: 0, totalCourses: 0, totalDuration: 0, certifiedPaths: 0 });

  // ══════════════════════════════════════════
  //  Pipeline
  // ══════════════════════════════════════════
  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(400),
        distinctUntilChanged(
          (a, b) =>
            a.page === b.page &&
            a.search === b.search &&
            a.difficulty === b.difficulty &&
            a.hasCertificate === b.hasCertificate &&
            a.sort === b.sort,
        ),
        tap(() => {
          this.loading.set(true);
          this.error.set(false);
        }),
        switchMap((q) => {
          const params: Record<string, any> = { page: q.page, limit: this.pageSize, sort: q.sort };
          if (q.search) params['search'] = q.search;
          if (q.difficulty) params['difficulty'] = q.difficulty;
          if (q.hasCertificate) params['hasCertificate'] = 'true';

          return this.lpService.getAll(params).pipe(
            takeUntil(this.destroy$),
            catchError((err) => {
              this.paths.set([]);
              this.error.set(true);
              this.toast.error(err?.error?.message || 'خطا در دریافت مسیرهای یادگیری');
              return of({ data: [], pagination: null });
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((res: any) => {
        this.paths.set(res?.data || []);
        this.pagination.set(res?.pagination || null);
        this.totalCount.set(res?.pagination?.total ?? res?.data?.length ?? 0);
        this.loading.set(false);
      });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.add('lp-fullpage');
    }
    this.loadHeroStats();
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('lp-fullpage');
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadHeroStats(): void {
    this.lpService
      .getPublicStats()
      .pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$),
      )
      .subscribe((res: any) => {
        if (res?.data) {
          this.heroStats.set({
            totalPaths: res.data.totalPaths || 0,
            totalCourses: res.data.totalCourses || 0,
            totalDuration: res.data.totalDuration || 0,
            certifiedPaths: res.data.certifiedPaths || 0,
          });
        }
      });
  }

  // ══════════════════════════════════════════
  //  Actions
  // ══════════════════════════════════════════
  setDifficulty(diff: DifficultyFilter): void {
    if (this.selectedDifficulty() === diff) return;
    this.selectedDifficulty.set(diff);
    this.page.set(1);
  }

  toggleCertificate(): void {
    this.requireCertificate.update((v) => !v);
    this.page.set(1);
  }

  setSort(sort: SortOption): void {
    if (this.sortBy() === sort) return;
    this.sortBy.set(sort);
    this.page.set(1);
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  focusSearch(): void {
    this.searchInput()?.nativeElement?.focus();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedDifficulty.set('all');
    this.requireCertificate.set(false);
    this.sortBy.set('-createdAt');
    this.page.set(1);
  }

  // ══════════════════════════════════════════
  //  Pagination
  // ══════════════════════════════════════════
  goToPage(p: number | 'gap'): void {
    if (p === 'gap') return;
    if (p < 1 || p > this.totalPages() || p === this.page()) return;
    this.page.set(p);
    this.scrollToResults();
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.update((p) => p + 1);
      this.scrollToResults();
    }
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      this.scrollToResults();
    }
  }

  private scrollToResults(): void {
    if (isPlatformBrowser(this.platformId)) {
      const el = document.querySelector('.content');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  // ══════════════════════════════════════════
  //  Helpers
  // ══════════════════════════════════════════
  diffMeta(diff?: string): DifficultyMeta {
    return this.difficultyMeta[diff || 'mixed'] || this.difficultyMeta['mixed'];
  }

  stageCount(path: ILearningPath): number {
    return path?.stages?.length || 0;
  }

  courseCount(path: ILearningPath): number {
    if (path?.totalCourses) return path.totalCourses;
    return (path?.stages || []).reduce((sum, s) => sum + (s.courses?.length || 0), 0);
  }

  getStagePreviewColors(path: ILearningPath, max = 4): string[] {
    return (path?.stages || []).slice(0, max).map((s) => s.color || '#a435f0');
  }

  fallbackGradient(path: ILearningPath): string {
    const c = this.diffMeta(path?.difficulty).color;
    return `linear-gradient(135deg, ${c}33 0%, ${c}0d 100%)`;
  }

  trackByPath(_i: number, p: ILearningPath): string {
    return p._id || p.slug || String(_i);
  }

  trackByKey(_i: number, item: { key: string }): string {
    return item.key;
  }
}
