import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { MegaMenuService } from '../../../core/services/mega-menu.service';
import { CourseService } from '../../../core/services/course.service';
import { Category } from '../../../core/models/category.model';
import { CategoryDialogComponent } from './category-dialog/category-dialog.component';
import { CategoryIconComponent } from '../../../shared/components/category-icon/category-icon.component';

interface CategoryWithChildren extends Category {
  children?: Category[];
  expanded?: boolean;
}

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'courses' | 'newest';

@Component({
  selector: 'app-categories-management',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    FormsModule,
    CategoryIconComponent,
  ],
  templateUrl: './categories-management.component.html',
  styleUrl: './categories-management.component.scss',
})
export class CategoriesManagementComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private megaMenuService = inject(MegaMenuService);
  private courseService = inject(CourseService);

  // ================= State =================
  categories = signal<CategoryWithChildren[]>([]);
  isLoading = signal(true);
  searchQuery = signal('');
  showInactive = signal(true);
  viewMode = signal<ViewMode>('grid');
  sortBy = signal<SortBy>('name');
  expandedIds = signal<Set<string>>(new Set());

  // ================= Computed =================
  totalCategories = computed(() => this.categories().length);
  activeCategories = computed(() => this.categories().filter((c) => c.isActive).length);
  inactiveCategories = computed(() => this.categories().filter((c) => !c.isActive).length);

  totalCourses = computed(() =>
    this.categories().reduce((sum, c) => sum + (c.totalCourses || 0), 0),
  );

  totalSubCategories = computed(() =>
    this.categories().reduce((sum, c) => sum + (c.children?.length || 0), 0),
  );

  filteredCategories = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const showAll = this.showInactive();
    const sort = this.sortBy();

    let result = this.categories()
      .map((cat) => {
        if (!showAll && !cat.isActive) return null;

        let filteredChildren = cat.children;
        if (!showAll && filteredChildren) {
          filteredChildren = filteredChildren.filter((child) => child.isActive);
        }

        if (query) {
          const inName = cat.name.toLowerCase().includes(query);
          const inChildren = filteredChildren?.some((sub) =>
            sub.name.toLowerCase().includes(query),
          );

          if (!inName && !inChildren) return null;
        }

        return { ...cat, children: filteredChildren };
      })
      .filter((cat) => cat !== null) as CategoryWithChildren[];

    result = [...result].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'fa');
      if (sort === 'courses') return (b.totalCourses || 0) - (a.totalCourses || 0);
      if (sort === 'newest') {
        return (
          new Date((b as any).createdAt || 0).getTime() -
          new Date((a as any).createdAt || 0).getTime()
        );
      }
      return 0;
    });

    return result;
  });

  // ================= Lifecycle =================
  ngOnInit() {
    this.loadCategories();
  }

  // ================= Methods =================
  loadCategories(): void {
    this.isLoading.set(true);
    const timestamp = new Date().getTime();

    // ارسال پارامتر به صورت صریح در query string
    this.api
      .get<CategoryWithChildren[]>(`/categories/tree?showAll=true&_t=${timestamp}`)
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.categories.set(res.data);
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
          this.snackBar.open('خطا در دریافت لیست دسته‌بندی‌ها', 'بستن', {
            duration: 3000,
            direction: 'rtl',
            panelClass: ['snackbar-error'],
          });
        },
      });
  }

  private refreshMegaMenu(): void {
    // ♻️ پاک‌سازی کش دسته‌بندی‌ها تا صفحه اصلی/کاتالوگ داده تازه بگیرند
    this.courseService.invalidateCategoryCache();
    this.megaMenuService.clearCache();
    this.megaMenuService.loadMegaMenu(true).subscribe();
  }

  toggleExpand(id: string): void {
    this.expandedIds.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  setSortBy(sort: SortBy): void {
    this.sortBy.set(sort);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  /**
   * 🆕 باز کردن دیالوگ ساخت دسته‌بندی
   *
   * اگر `parentCategory` داده شود، دیالوگ در حالت «ساخت زیردسته» باز می‌شود
   * و والد در آن قفل می‌شود (تا کاربر اشتباه دسته اصلی نسازد).
   */
  openCreateDialog(parentCategory?: Category): void {
    // 🛡️ بک‌اند حداکثر ۲ سطح را پشتیبانی می‌کند (root → subcategory)
    if (parentCategory && (parentCategory.level ?? 0) >= 1) {
      this.snackBar.open(
        'امکان ساخت زیردسته برای زیردسته وجود ندارد (حداکثر ۲ سطح)',
        'بستن',
        { duration: 4000, direction: 'rtl', panelClass: ['snackbar-error'] },
      );
      return;
    }

    const ref = this.dialog.open(CategoryDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: { parent: parentCategory || null, categories: this.categories() },
    });
    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.loadCategories();
        this.refreshMegaMenu();
      }
    });
  }

  editCategory(cat: CategoryWithChildren, event?: Event): void {
    event?.stopPropagation();
    const ref = this.dialog.open(CategoryDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: { category: cat, categories: this.categories() },
    });
    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.loadCategories();
        this.refreshMegaMenu();
      }
    });
  }

  toggleActive(cat: CategoryWithChildren, event?: Event): void {
    event?.stopPropagation();

    this.api.patch<any>(`/categories/${cat._id}/toggle-active`, {}).subscribe({
      next: (res) => {
        this.snackBar.open(
          `دسته‌بندی «${cat.name}» با موفقیت ${res.data?.isActive ? 'فعال' : 'غیرفعال'} شد`,
          'بستن',
          { duration: 3000, direction: 'rtl', panelClass: ['snackbar-success'] },
        );

        // 💡 ابتدا جدول ادمین لود می‌شود و سپس مگامنو با تاخیر کوتاه آپدیت می‌شود تا کش‌ها تداخل نکنند
        this.loadCategories();
        setTimeout(() => this.refreshMegaMenu(), 500);
      },
      error: (err) => {
        this.snackBar.open(err?.error?.message || 'خطا در تغییر وضعیت', 'بستن', {
          duration: 4000,
          direction: 'rtl',
          panelClass: ['snackbar-error'],
        });
      },
    });
  }

  deleteCategory(cat: CategoryWithChildren, event?: Event): void {
    event?.stopPropagation();
    if (!confirm(`آیا از حذف «${cat.name}» مطمئن هستید؟`)) return;

    this.api.delete<any>(`/categories/${cat._id}`).subscribe({
      next: () => {
        this.snackBar.open(`«${cat.name}» با موفقیت حذف شد`, 'بستن', {
          duration: 3000,
          direction: 'rtl',
          panelClass: ['snackbar-success'],
        });
        this.loadCategories();
        setTimeout(() => this.refreshMegaMenu(), 500);
      },
      error: (err) =>
        this.snackBar.open(
          err?.error?.message || 'خطا در حذف. ممکن است دسته دارای زیرشاخه یا دوره باشد.',
          'بستن',
          { duration: 4000, direction: 'rtl', panelClass: ['snackbar-error'] },
        ),
    });
  }

  deleteSubCategory(sub: Category, event?: Event): void {
    event?.stopPropagation();
    if (!confirm(`آیا از حذف زیردسته «${sub.name}» مطمئن هستید؟`)) return;

    this.api.delete<any>(`/categories/${sub._id}`).subscribe({
      next: () => {
        this.snackBar.open(`زیردسته «${sub.name}» با موفقیت حذف شد`, 'بستن', {
          duration: 3000,
          direction: 'rtl',
          panelClass: ['snackbar-success'],
        });
        this.loadCategories();
        setTimeout(() => this.refreshMegaMenu(), 500);
      },
      error: (err) =>
        this.snackBar.open(
          err?.error?.message || 'خطا در حذف زیردسته. ممکن است دارای زیرشاخه یا دوره باشد.',
          'بستن',
          { duration: 4000, direction: 'rtl', panelClass: ['snackbar-error'] },
        ),
    });
  }

  /** 🎨 آیا دسته‌بندی رنگ پس‌زمینه دارد؟ (رنگ اختیاری است) */
  hasCategoryColor(cat: Category): boolean {
    const color = typeof cat?.color === 'string' ? cat.color.trim() : '';
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
  }

  /**
   * 🎨 گرادیان کارت دسته‌بندی
   * اگر رنگ ذخیره‌شده در دیتابیس معتبر باشد، همان استفاده می‌شود؛
   * در غیر این صورت (رنگ اختیاری و انتخاب‌نشده) شفاف برمی‌گردد تا
   * فقط آیکون/تصویر دسته‌بندی نمایش داده شود.
   */
  catGradient(cat: Category, index: number): string {
    const color = typeof cat?.color === 'string' ? cat.color.trim() : '';
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      return `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #ffffff))`;
    }
    return 'transparent';
  }
}
