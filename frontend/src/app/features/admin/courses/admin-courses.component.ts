import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { Course } from '../../../core/models/course.model';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { environment } from '../../../../environments/environment.development';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

interface StatusFilter {
  value: string;
  label: string;
  icon: string;
  color: string;
  count?: number;
}

@Component({
  selector: 'app-admin-courses',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    TomanPipe,
    JalaliDatePipe,
    SanitizeHtmlPipe,
    ImageFallbackDirective,
    RichTextEditorComponent,
  ],
  templateUrl: './admin-courses.component.html',
  styleUrl: './admin-courses.component.scss',
})
export class AdminCoursesComponent implements OnInit {
  courses = signal<Course[]>([]);
  isLoading = signal<boolean>(true);
  filterStatus = signal<string>('pending');
  searchQuery = signal<string>('');
  sortBy = signal<string>('newest');
  viewMode = signal<'list' | 'grid'>('list');
  selectedCourse = signal<any>(null);
  showRejectModal = signal<boolean>(false);
  rejectReason = signal<string>('');
  processingId = signal<string | null>(null);
  
  // Delete modal
  showDeleteModal = signal<boolean>(false);
  deleteReason = signal<string>('');

  totalPending = signal<number>(0);
  totalPublished = signal<number>(0);
  totalRejected = signal<number>(0);
  totalDraft = signal<number>(0);

  statusFilters: StatusFilter[] = [
    {
      value: 'pending',
      label: 'در انتظار تأیید',
      icon: 'schedule',
      color: 'amber',
    },
    {
      value: 'published',
      label: 'منتشر شده',
      icon: 'check_circle',
      color: 'green',
    },
    { value: 'rejected', label: 'رد شده', icon: 'cancel', color: 'red' },
    {
      value: 'draft',
      label: 'پیش‌نویس',
      icon: 'edit_note',
      color: 'slate',
    },
  ];

  sortOptions = [
    { value: 'newest', label: 'جدیدترین' },
    { value: 'oldest', label: 'قدیمی‌ترین' },
    { value: 'price_high', label: 'گران‌ترین' },
    { value: 'price_low', label: 'ارزان‌ترین' },
    { value: 'title', label: 'الفبایی' },
  ];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadCourses();
    this.loadStats();
  }

  loadCourses(): void {
    this.isLoading.set(true);
    this.api
      .getPaginated<Course>('/courses', {
        status: this.filterStatus(),
        limit: 50,
      })
      .subscribe({
        next: (res) => {
          const rows = res.data ?? [];
          this.courses.set(rows.map((c: any) => this.normalizeCourse(c)));
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
  }

  loadStats(): void {
    this.statusFilters.forEach((filter) => {
      this.api
        .getPaginated<Course>('/courses', { status: filter.value, limit: 1 })
        .subscribe({
          next: (res: any) => {
            const total =
              res.meta?.total ??
              res.total ??
              res.pagination?.total ??
              res.data?.length ??
              0;

            filter.count = total;

            switch (filter.value) {
              case 'pending':
                this.totalPending.set(total);
                break;
              case 'published':
                this.totalPublished.set(total);
                break;
              case 'rejected':
                this.totalRejected.set(total);
                break;
              case 'draft':
                this.totalDraft.set(total);
                break;
            }
          },
        });
    });
  }

  private normalizeCourse(course: any): any {
    if (!course) return course;

    const instructor = course.instructor
      ? {
          ...course.instructor,
          avatar: this.resolveMediaUrl(course.instructor.avatar),
        }
      : course.instructor;

    return {
      ...course,
      thumbnail: this.resolveMediaUrl(course.thumbnail),
      instructor,
    };
  }

  resolveMediaUrl(raw: unknown): string | null {
    if (raw == null) return null;

    let url = '';
    if (typeof raw === 'string') {
      url = raw.trim();
    } else if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      url = String(
        o['url'] ?? o['path'] ?? o['secure_url'] ?? o['src'] ?? ''
      ).trim();
    }

    if (!url || url === 'null' || url === 'undefined') return null;
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) return null;

    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;

    const base = this.getMediaBaseUrl();
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  private getMediaBaseUrl(): string {
    if (environment.socketUrl) {
      return environment.socketUrl.replace(/\/$/, '');
    }
    if (environment.apiUrl) {
      return environment.apiUrl
        .replace(/\/api\/v1\/?$/, '')
        .replace(/\/api\/?$/, '')
        .replace(/\/$/, '');
    }
    return environment.socketUrl || 'https://homayoon.academy';
  }

  setFilter(status: string): void {
    this.filterStatus.set(status);
    this.searchQuery.set('');
    this.loadCourses();
  }

  setSortBy(sort: string): void {
    this.sortBy.set(sort);
  }

  toggleView(): void {
    this.viewMode.update((v) => (v === 'list' ? 'grid' : 'list'));
  }

  approveCourse(course: any): void {
    this.processingId.set(course._id);
    this.api
      .put<any>(`/courses/${course._id}`, { status: 'published' })
      .subscribe({
        next: () => {
          this.processingId.set(null);
          this.loadCourses();
          this.loadStats();
        },
        error: () => this.processingId.set(null),
      });
  }

  openRejectModal(course: any): void {
    this.selectedCourse.set(course);
    this.rejectReason.set('');
    this.showRejectModal.set(true);
  }

  closeRejectModal(): void {
    this.showRejectModal.set(false);
    this.selectedCourse.set(null);
    this.rejectReason.set('');
  }

  confirmReject(): void {
    const course = this.selectedCourse();
    const reason = this.rejectReason().trim();

    if (!course || !reason || reason.length < 5) return;

    this.processingId.set(course._id);
    this.api
      .put<any>(`/courses/${course._id}`, {
        status: 'rejected',
        rejectionReason: reason,
      })
      .subscribe({
        next: () => {
          this.processingId.set(null);
          this.closeRejectModal();
          this.loadCourses();
          this.loadStats();
        },
        error: () => this.processingId.set(null),
      });
  }

  onRejectReasonChange(html: string): void {
    this.rejectReason.set(html);
  }

  // ==================== DELETE COURSE ====================
  openDeleteModal(course: any): void {
    this.selectedCourse.set(course);
    this.deleteReason.set('');
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    this.showDeleteModal.set(false);
    this.selectedCourse.set(null);
    this.deleteReason.set('');
  }

  confirmDelete(): void {
    const course = this.selectedCourse();
    const reason = this.deleteReason().trim();

    if (!course) return;

    this.processingId.set(course._id);
    this.api
      .delete<any>(`/courses/${course._id}`)
      .subscribe({
        next: () => {
          this.processingId.set(null);
          this.closeDeleteModal();
          this.loadCourses();
          this.loadStats();
        },
        error: () => this.processingId.set(null),
      });
  }

  displayedCourses = computed(() => {
    let list = this.courses();
    const query = this.searchQuery().trim().toLowerCase();

    if (query) {
      list = list.filter(
        (c: any) =>
          c.title?.toLowerCase().includes(query) ||
          c.instructor?.fullName?.toLowerCase().includes(query) ||
          c.slug?.toLowerCase().includes(query)
      );
    }

    const sort = this.sortBy();
    list = [...list].sort((a: any, b: any) => {
      switch (sort) {
        case 'newest':
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case 'oldest':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case 'price_high':
          return (b.price || 0) - (a.price || 0);
        case 'price_low':
          return (a.price || 0) - (b.price || 0);
        case 'title':
          return (a.title || '').localeCompare(b.title || '', 'fa');
        default:
          return 0;
      }
    });

    return list;
  });

  currentFilterInfo = computed(() => {
    return this.statusFilters.find((f) => f.value === this.filterStatus());
  });

  get skeletonArray(): number[] {
    return Array(4)
      .fill(0)
      .map((_, i) => i);
  }

  trackByCourse(index: number, course: any): string {
    return course._id || index.toString();
  }

  levelLabel(level?: string): string {
    switch (level) {
      case 'beginner':
        return 'مبتدی';
      case 'intermediate':
        return 'متوسط';
      case 'advanced':
        return 'پیشرفته';
      default:
        return level || '';
    }
  }
}