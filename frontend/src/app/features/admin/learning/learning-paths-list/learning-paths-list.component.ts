import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject, debounceTime, takeUntil, distinctUntilChanged } from 'rxjs';

import { LearningPathService, ILearningPath } from '../../../../services/learning-path.service';
import { ToastService } from '../../../../core/services/toast.service';
import { FaNumPipe } from '../../../../shared/pipes/fa-num.pipe';
import { JalaliDatePipe } from '../../../../shared/pipes/jalali-date.pipe';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';

type StatusFilter = '' | 'draft' | 'published' | 'archived';
type SortOption = '-createdAt' | 'createdAt' | '-enrolledStudents' | '-totalCourses' | 'title';
type ViewMode = 'table' | 'grid';

@Component({
  selector: 'app-learning-paths-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    FaNumPipe,
    // JalaliDatePipe,
    DurationPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './learning-paths-list.component.html',
  styleUrls: ['./learning-paths-list.component.scss'],
})
export class LearningPathsListComponent implements OnInit, OnDestroy {
  private lpService = inject(LearningPathService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();

  readonly paths = signal<ILearningPath[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly perPage = signal(12);
  readonly viewMode = signal<ViewMode>('table');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly actionInProgress = signal<string | null>(null);

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusFilter = signal<StatusFilter>('');
  readonly sortBy = signal<SortOption>('-createdAt');

  readonly currentSortLabel = computed(() => {
    const idx = this.sortOptions.findIndex((o) => o.value === this.sortBy());
    return idx >= 0 ? this.sortOptions[idx].label : 'مرتب‌سازی';
  });

  readonly hasPaths = computed(() => this.paths().length > 0);
  readonly isAllSelected = computed(() => {
    const paths = this.paths();
    if (paths.length === 0) return false;
    return paths.every((p) => this.selectedIds().has(p._id!));
  });
  readonly hasSelection = computed(() => this.selectedIds().size > 0);
  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly stats = computed(() => {
    const paths = this.paths();
    return {
      total: this.total(),
      published: paths.filter((p) => p.status === 'published').length,
      draft: paths.filter((p) => p.status === 'draft').length,
      archived: paths.filter((p) => p.status === 'archived').length,
      totalStudents: paths.reduce((sum, p) => sum + (p.enrolledStudents || 0), 0),
    };
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const delta = 2;

    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages: (number | 'dots')[] = [];
    const range = [];
    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
      range.push(i);
    }

    pages.push(1);
    if (current - delta > 2) pages.push('dots');
    pages.push(...range);
    if (current + delta < total - 1) pages.push('dots');
    pages.push(total);

    return pages;
  });

  readonly filterTabs = [
    { value: '' as StatusFilter, label: 'همه', icon: 'view_list' },
    { value: 'published' as StatusFilter, label: 'منتشرشده', icon: 'public' },
    { value: 'draft' as StatusFilter, label: 'پیش‌نویس', icon: 'edit_note' },
    { value: 'archived' as StatusFilter, label: 'آرشیو', icon: 'archive' },
  ];

  readonly sortOptions = [
    { value: '-createdAt' as SortOption, label: 'جدیدترین', icon: 'schedule' },
    { value: 'createdAt' as SortOption, label: 'قدیمی‌ترین', icon: 'history' },
    { value: '-enrolledStudents' as SortOption, label: 'محبوب‌ترین', icon: 'trending_up' },
    { value: '-totalCourses' as SortOption, label: 'بیشترین دوره', icon: 'library_books' },
    { value: 'title' as SortOption, label: 'الفبایی (الف تا ی)', icon: 'sort_by_alpha' },
  ];

  ngOnInit(): void {
    try {
      const saved = localStorage.getItem('lp-list-view-mode');
      if (saved === 'grid' || saved === 'table') this.viewMode.set(saved);
    } catch {}

    this.searchControl.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadPaths();
      });

    this.loadPaths();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPaths(): void {
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.lpService
      .getAllAdmin({
        page: this.currentPage(),
        limit: this.perPage(),
        status: this.statusFilter() || undefined,
        search: this.searchControl.value || undefined,
        sort: this.sortBy(),
      })
      .subscribe({
        next: (res: any) => {
          this.paths.set(res.data || []);
          const pagination = res.pagination || res.meta;
          this.total.set(pagination?.total || 0);
          this.totalPages.set(pagination?.pages || pagination?.totalPages || 1);
          this.loading.set(false);
        },
        error: () => {
          this.toast.error('خطا در بارگذاری مسیرهای یادگیری');
          this.loading.set(false);
        },
      });
  }

  setStatusFilter(status: StatusFilter): void {
    if (this.statusFilter() === status) return;
    this.statusFilter.set(status);
    this.currentPage.set(1);
    this.loadPaths();
  }

  setSort(sort: SortOption): void {
    this.sortBy.set(sort);
    this.currentPage.set(1);
    this.loadPaths();
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.statusFilter.set('');
    this.sortBy.set('-createdAt');
    this.currentPage.set(1);
    this.loadPaths();
  }

  toggleViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    try {
      localStorage.setItem('lp-list-view-mode', mode);
    } catch {}
  }

  goToPage(page: number | 'dots'): void {
    if (page === 'dots' || page === this.currentPage()) return;
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadPaths();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prevPage(): void {
    if (this.currentPage() > 1) this.goToPage(this.currentPage() - 1);
  }
  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.goToPage(this.currentPage() + 1);
  }

  toggleSelection(id: string, event?: Event): void {
    event?.stopPropagation();
    const set = new Set(this.selectedIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.selectedIds.set(set);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelectAll(): void {
    const paths = this.paths();
    if (this.isAllSelected()) this.selectedIds.set(new Set());
    else this.selectedIds.set(new Set(paths.map((p) => p._id!)));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  publishPath(path: ILearningPath, event?: Event): void {
    event?.stopPropagation();
    if (!path._id) return;
    this.actionInProgress.set(path._id);
    this.lpService.publish(path._id).subscribe({
      next: () => {
        this.toast.success(`«${path.title}» منتشر شد 🎉`);
        this.actionInProgress.set(null);
        this.loadPaths();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'خطا در انتشار');
        this.actionInProgress.set(null);
      },
    });
  }

  archivePath(path: ILearningPath, event?: Event): void {
    event?.stopPropagation();
    if (!path._id) return;
    if (!confirm(`آیا از آرشیو کردن «${path.title}» اطمینان دارید؟`)) return;
    this.actionInProgress.set(path._id);
    this.lpService.archive(path._id).subscribe({
      next: () => {
        this.toast.success('مسیر آرشیو شد');
        this.actionInProgress.set(null);
        this.loadPaths();
      },
      error: () => {
        this.toast.error('خطا در آرشیو');
        this.actionInProgress.set(null);
      },
    });
  }

  duplicatePath(path: ILearningPath, event?: Event): void {
    event?.stopPropagation();
    if (!path._id) return;
    this.actionInProgress.set(path._id);
    this.lpService.duplicate(path._id).subscribe({
      next: (res: any) => {
        this.toast.success('مسیر کپی شد');
        this.actionInProgress.set(null);
        if (res.data?._id) this.router.navigate(['/admin/learning-paths', res.data._id, 'edit']);
        else this.loadPaths();
      },
      error: () => {
        this.toast.error('خطا در کپی');
        this.actionInProgress.set(null);
      },
    });
  }

  deletePath(path: ILearningPath, event?: Event): void {
    event?.stopPropagation();
    if (!path._id) return;
    const message =
      path.enrolledStudents > 0
        ? `این مسیر ${path.enrolledStudents} دانشجوی ثبت‌نام‌شده دارد. ابتدا باید آرشیو شود. آیا از حذف اطمینان دارید؟`
        : `آیا از حذف «${path.title}» اطمینان دارید؟ این عمل غیرقابل بازگشت است.`;
    if (!confirm(message)) return;
    this.actionInProgress.set(path._id);
    this.lpService.delete(path._id).subscribe({
      next: () => {
        this.toast.success('مسیر حذف شد');
        this.actionInProgress.set(null);
        this.loadPaths();
      },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'خطا در حذف');
        this.actionInProgress.set(null);
      },
    });
  }

  previewPath(path: ILearningPath, event?: Event): void {
    event?.stopPropagation();
    if (path.slug && path.status === 'published')
      window.open(`/learning-paths/${path.slug}`, '_blank');
    else this.toast.info('این مسیر هنوز منتشر نشده است');
  }

  bulkDelete(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    if (!confirm(`حذف ${ids.length} مسیر انتخاب‌شده؟`)) return;
    let completed = 0;
    ids.forEach((id) => {
      this.lpService.delete(id).subscribe({
        next: () => {
          completed++;
          if (completed === ids.length) {
            this.toast.success(`${ids.length} مسیر حذف شد`);
            this.clearSelection();
            this.loadPaths();
          }
        },
        error: () => this.toast.error('برخی از مسیرها حذف نشدند'),
      });
    });
  }

  bulkArchive(): void {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    if (!confirm(`آرشیو ${ids.length} مسیر انتخاب‌شده؟`)) return;
    let completed = 0;
    ids.forEach((id) => {
      this.lpService.archive(id).subscribe({
        next: () => {
          completed++;
          if (completed === ids.length) {
            this.toast.success(`${ids.length} مسیر آرشیو شد`);
            this.clearSelection();
            this.loadPaths();
          }
        },
      });
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'پیش‌نویس',
      published: 'منتشرشده',
      archived: 'آرشیو',
    };
    return labels[status] || status;
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      draft: 'edit_note',
      published: 'public',
      archived: 'archive',
    };
    return icons[status] || 'help';
  }

  getDifficultyLabel(difficulty: string): string {
    const labels: Record<string, string> = {
      beginner: 'مبتدی',
      intermediate: 'متوسط',
      advanced: 'پیشرفته',
      mixed: 'ترکیبی',
    };
    return labels[difficulty] || difficulty;
  }

  getDifficultyColor(difficulty: string): string {
    const colors: Record<string, string> = {
      beginner: '#4e9f3d',
      intermediate: '#dd9a28',
      advanced: '#d94f6a',
      mixed: '#6c5ce7',
    };
    return colors[difficulty] || '#6b7280';
  }

  getStagePreviewColors(path: ILearningPath, max = 5): string[] {
    return (path.stages || []).slice(0, max).map((s) => s.color || '#a435f0');
  }

  getExtraStagesCount(path: ILearningPath, max = 5): number {
    const total = path.stages?.length || 0;
    return total > max ? total - max : 0;
  }

  trackByPathId(index: number, path: ILearningPath): string {
    return path._id || `path-${index}`;
  }
  trackByPage(index: number, page: number | 'dots'): string {
    return `${page}-${index}`;
  }
  hasActiveFilters(): boolean {
    return (
      !!this.searchControl.value || this.statusFilter() !== '' || this.sortBy() !== '-createdAt'
    );
  }
}
