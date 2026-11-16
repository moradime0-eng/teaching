import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Enrollment } from '../../../core/models/enrollment.model';
import { ApiService } from '../../../core/services/api.service';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

type FilterTab = 'all' | 'in-progress' | 'completed';
type SortOption = 'recent' | 'progress-desc' | 'progress-asc';

@Component({
  selector: 'app-my-courses',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, ImageFallbackDirective],
  templateUrl: './my-courses.component.html',
  styleUrl: './my-courses.component.scss',
})
export class MyCoursesComponent implements OnInit {
  enrollments = signal<Enrollment[]>([]);
  isLoading = signal<boolean>(true);
  searchQuery = signal<string>('');
  activeTab = signal<FilterTab>('all');
  sortBy = signal<SortOption>('recent');

  private isBrowser = false;

  constructor(
    private api: ApiService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.fetchEnrollments();
  }

  fetchEnrollments(): void {
    this.isLoading.set(true);
    this.api.get<Enrollment[]>('/enrollments').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.enrollments.set(res.data);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  // Stats computed from real enrollments
  stats = computed(() => {
    const list = this.enrollments();
    const total = list.length;
    const completed = list.filter((item) => (item.progress || 0) >= 100).length;
    const inProgress = list.filter(
      (item) => (item.progress || 0) > 0 && (item.progress || 0) < 100,
    ).length;
    const avgProgress =
      total > 0 ? Math.round(list.reduce((acc, curr) => acc + (curr.progress || 0), 0) / total) : 0;

    return { total, completed, inProgress, avgProgress };
  });

  // Filtered & Sorted Enrollments list
  filteredEnrollments = computed(() => {
    let list = [...this.enrollments()];
    const query = this.searchQuery().trim().toLowerCase();
    const tab = this.activeTab();
    const sort = this.sortBy();

    // 1. Filter by Tab
    if (tab === 'in-progress') {
      list = list.filter((item) => (item.progress || 0) < 100);
    } else if (tab === 'completed') {
      list = list.filter((item) => (item.progress || 0) >= 100);
    }

    // 2. Filter by Search Query
    if (query) {
      list = list.filter((item) => {
        const title = this.getCourseDetail(item)?.title?.toLowerCase() || '';
        const instructor = this.getCourseDetail(item)?.instructor?.fullName?.toLowerCase() || '';
        return title.includes(query) || instructor.includes(query);
      });
    }

    // 3. Sorting
    if (sort === 'progress-desc') {
      list.sort((a, b) => (b.progress || 0) - (a.progress || 0));
    } else if (sort === 'progress-asc') {
      list.sort((a, b) => (a.progress || 0) - (b.progress || 0));
    }

    return list;
  });

  getCourseDetail(item: any): any {
    return item?.course || {};
  }

  setTab(tab: FilterTab): void {
    this.activeTab.set(tab);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  get skeletonArray(): number[] {
    return Array(6)
      .fill(0)
      .map((_, i) => i);
  }

  trackByEnrollment(index: number, item: Enrollment): string {
    return (item as any)._id || index.toString();
  }
}
