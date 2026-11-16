import { Component, DestroyRef, OnInit, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Subject, of } from 'rxjs';
import { catchError, startWith, switchMap } from 'rxjs/operators';
import { CourseService } from '../../../../core/services/course.service';
import { CourseCardComponent } from '../../../../shared/components/course-card/course-card.component';
import { CategoryFilterBarComponent } from '../../../../shared/components/category-filter-bar/category-filter-bar.component';

@Component({
  selector: 'app-new-releases',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    CourseCardComponent,
    CategoryFilterBarComponent,
  ],
  templateUrl: './new-releases.component.html',
  styleUrl: './new-releases.component.scss',
})
export class NewReleasesComponent implements OnInit {
  private courseService = inject(CourseService);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  isLoading = signal(true);
  courses = signal<any[]>([]);
  isLoadingCategories = signal(true);
  error = signal(false);

  /** دسته‌ی فعال سکشن جدیدترین‌ها؛ null = همه دوره‌ها */
  readonly activeCategory = signal<string | null>(null);
  readonly activeCategoryName = computed(() => {
    const id = this.activeCategory();
    if (!id) return '';
    return (this.courseService.categories() ?? []).find((c: any) => c._id === id)?.name ?? '';
  });

  readonly categories = computed(() =>
    (this.courseService.categories() ?? []).filter((c: any) => {
      if (!c) return false;
      const hasParent = !!c.parent;
      const level = c.level;
      return !hasParent && (level === 0 || level === null || level === undefined);
    }),
  );

  skeletonItems = Array(8).fill(0);

  private readonly categoryRequest$ = new Subject<string | null>();

  ngOnInit(): void {
    this.loadCategories();
    this.setupStream();
    this.categoryRequest$.next(null);
  }

  private loadCategories(): void {
    // اگر دسته‌بندی‌ها قبلاً توسط صفحه اصلی بارگذاری شده‌اند، دوباره درخواست نزن
    if ((this.courseService.categories() ?? []).length > 0) {
      this.isLoadingCategories.set(false);
      return;
    }
    this.courseService.getCategoryTree().subscribe({
      next: () => this.isLoadingCategories.set(false),
      error: () => this.isLoadingCategories.set(false),
    });
  }

  /**
   * استریم جدیدترین دوره‌ها بر اساس دسته‌ی فعال.
   * switchMap از race condition جلوگیری می‌کند و startWith(undefined)
   * بلافاصله loading state نمایش می‌دهد.
   */
  private setupStream(): void {
    this.categoryRequest$
      .pipe(
        switchMap((categoryId) => {
          this.error.set(false);
          return this.courseService
            .getCourses({ sort: 'newest', limit: 8, category: categoryId ?? undefined })
            .pipe(
              startWith(undefined),
              catchError(() => {
                this.error.set(true);
                return of(null);
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res === undefined) {
          this.courses.set([]);
          this.isLoading.set(true);
          return;
        }
        if (res === null) {
          this.isLoading.set(false);
          return;
        }
        this.courses.set(res.data || []);
        this.isLoading.set(false);
      });
  }

  onCategoryChange(categoryId: string | null): void {
    if (this.activeCategory() === categoryId) return;
    this.activeCategory.set(categoryId);
    this.categoryRequest$.next(categoryId);
  }

  retry(): void {
    this.error.set(false);
    this.categoryRequest$.next(this.activeCategory());
  }

  sectionTitle(): string {
    const name = this.activeCategoryName();
    return name ? `جدیدترین دوره‌های ${name}` : 'جدیدترین دوره‌های آموزشی';
  }

  scrollLeft(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.querySelector('.nr-scroll__track');
    if (el) el.scrollBy({ left: 320, behavior: 'smooth' });
  }

  scrollRight(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.querySelector('.nr-scroll__track');
    if (el) el.scrollBy({ left: -320, behavior: 'smooth' });
  }
}
