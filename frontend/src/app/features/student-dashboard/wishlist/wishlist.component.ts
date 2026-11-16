import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { Course } from '../../../core/models/course.model';
import { CourseCardComponent } from '../../../shared/components/course-card/course-card.component';

type SortOption = 'newest' | 'price_low' | 'price_high' | 'rating';

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, CourseCardComponent],
  templateUrl: './wishlist.component.html',
  styleUrl: './wishlist.component.scss',
})
export class WishlistComponent implements OnInit {
  wishlistCourses = signal<Course[]>([]);
  isLoading = signal<boolean>(true);
  isClearing = signal<boolean>(false);
  searchQuery = signal<string>('');
  sortBy = signal<SortOption>('newest');

  private isBrowser = false;

  constructor(
    private api: ApiService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.loadWishlist();
  }

  loadWishlist(): void {
    this.isLoading.set(true);
    this.api.get<any>('/wishlist').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const mapped = res.data.courses
            ? res.data.courses.map((item: any) => item.course || item)
            : Array.isArray(res.data)
              ? res.data
              : [];
          this.wishlistCourses.set(mapped);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  // --- Computed Stats & Calculations ---
  totalCount = computed(() => this.wishlistCourses().length);

  totalPrice = computed(() => {
    return this.wishlistCourses().reduce((sum, course) => {
      const price =
        course.pricing?.currentPrice ??
        course.currentPrice ??
        (course.discountPrice !== undefined && course.discountPrice !== null
          ? course.discountPrice
          : course.price || 0);
      return sum + price;
    }, 0);
  });

  totalOriginalPrice = computed(() => {
    return this.wishlistCourses().reduce((sum, course) => {
      return sum + (course.pricing?.originalPrice ?? (course.price || 0));
    }, 0);
  });

  totalDiscount = computed(() => {
    return this.totalOriginalPrice() - this.totalPrice();
  });

  // --- Safe Property Extractors ---
  private getInstructorName(instructor: any): string {
    if (!instructor) return '';
    if (typeof instructor === 'object' && 'fullName' in instructor) {
      return instructor.fullName || '';
    }
    return typeof instructor === 'string' ? instructor : '';
  }

  private getCategoryName(category: any): string {
    if (!category) return '';
    if (typeof category === 'object' && 'name' in category) {
      return category.name || '';
    }
    return typeof category === 'string' ? category : '';
  }

  // --- Filtered & Sorted Courses ---
  filteredCourses = computed(() => {
    let list = [...this.wishlistCourses()];
    const query = this.searchQuery().trim().toLowerCase();
    const sort = this.sortBy();

    // 1. Search Query with Safe Extraction
    if (query) {
      list = list.filter((course) => {
        const titleMatch = course.title?.toLowerCase().includes(query) ?? false;

        const instructorName = this.getInstructorName(course.instructor).toLowerCase();
        const instructorMatch = instructorName.includes(query);

        const categoryName = this.getCategoryName(course.category).toLowerCase();
        const categoryMatch = categoryName.includes(query);

        return titleMatch || instructorMatch || categoryMatch;
      });
    }

    // 2. Sorting
    if (sort === 'price_low') {
      list.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sort === 'price_high') {
      list.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      // Default: newest
      list.sort((a, b) => {
        const dateA = new Date((a as any).createdAt || 0).getTime();
        const dateB = new Date((b as any).createdAt || 0).getTime();
        return dateB - dateA;
      });
    }

    return list;
  });

  // Clear All Wishlist Items
  clearAllWishlist(): void {
    if (
      this.isBrowser &&
      !confirm('آیا از پاک کردن تمام دوره‌ها از لیست علاقه‌مندی‌ها اطمینان دارید؟')
    ) {
      return;
    }

    this.isClearing.set(true);
    this.api.delete<any>('/wishlist/clear').subscribe({
      next: () => {
        this.wishlistCourses.set([]);
        this.isClearing.set(false);
      },
      error: () => {
        // Fallback for UI if route not found
        this.wishlistCourses.set([]);
        this.isClearing.set(false);
      },
    });
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  trackByCourse(index: number, course: Course): string {
    return (course as any)._id || index.toString();
  }

  get skeletonArray(): number[] {
    return Array(6)
      .fill(0)
      .map((_, i) => i);
  }
}
