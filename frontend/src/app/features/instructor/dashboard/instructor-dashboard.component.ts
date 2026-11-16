import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';
import { environment } from '../../../../environments/environment.development';

interface RecentActivity {
  type: 'enrollment' | 'review' | 'comment' | 'payment';
  icon: string;
  color: string;
  title: string;
  description: string;
  time: string;
  amount?: number;
}

interface TopCourse {
  _id?: string;
  title: string;
  thumbnail?: string | null;
  students: number;
  rating: number;
  revenue: number;
  progress?: number;
  status?: 'draft' | 'pending' | 'published' | 'rejected' | 'archived';
  rejectionReason?: string | null;
}

@Component({
  selector: 'app-instructor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, TomanPipe, SanitizeHtmlPipe],
  templateUrl: './instructor-dashboard.component.html',
  styleUrl: './instructor-dashboard.component.scss',
})
export class InstructorDashboardComponent implements OnInit {
  private router = inject(Router);

  stats = signal<any>(null);
  isLoading = signal<boolean>(true);
  selectedPeriod = signal<string>('month');
  currentTime = signal<string>('');

  topCourses = signal<TopCourse[]>([]);
  recentActivities = signal<RecentActivity[]>([]);

  // سیگنال برای مدیریت عکس‌های خراب (Broken Images)
  brokenThumbs = signal<Record<string, boolean>>({});

  periods = [
    { value: 'week', label: 'هفته' },
    { value: 'month', label: 'ماه' },
    { value: 'year', label: 'سال' },
  ];

  constructor(
    private api: ApiService,
    public authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadDashboard();
    this.updateGreeting();
  }

  loadDashboard(): void {
    this.isLoading.set(true);
    this.api.get<any>('/dashboard/instructor').subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.stats.set(res.data);
          this.processData(res.data);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Instructor dashboard error:', err);
        this.isLoading.set(false);
      },
    });
  }

  processData(data: any): void {
    const rawCourses = data?.topCourses ?? data?.recentCourses ?? [];
    const courses = Array.isArray(rawCourses) ? rawCourses : [];

    this.topCourses.set(
      courses.map((c: any) => ({
        _id: c._id,
        title: c.title || 'بدون عنوان',
        thumbnail: this.resolveThumbnail(c.thumbnail),
        students: Number(c.students ?? c.totalStudents ?? 0),
        rating: Number(c.rating ?? c.averageRating ?? 0),
        revenue: Number(c.revenue ?? c.totalRevenue ?? 0),
        status: c.status || 'draft',
        rejectionReason: c.rejectionReason || null,
      })),
    );

    const rawActivities = data?.recentActivities ?? [];
    this.recentActivities.set(Array.isArray(rawActivities) ? rawActivities : []);
  }

  // 🆕 متد اصلاح مسیر عکس‌ها (ترکیب مسیر نسبی با آدرس بک‌اند)
  private resolveThumbnail(raw: unknown): string | null {
    if (raw == null) return null;

    let url = '';
    if (typeof raw === 'string') {
      url = raw.trim();
    } else if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      url = String(o['url'] ?? o['path'] ?? o['secure_url'] ?? o['src'] ?? '').trim();
    }

    if (!url || url === 'null' || url === 'undefined') return null;
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) return null;

    // مسیرهای مطلق (مثل فضای ابری یا لینک خارجی)
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;

    // مسیرهای نسبی → ترکیب با آدرس سرور
    const base = this.getMediaBaseUrl();
    if (!base) return url;

    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  // 🆕 دریافت آدرس پایه سرور از environment.ts
  private getMediaBaseUrl(): string {
    if (environment.socketUrl) {
      return environment.socketUrl.replace(/\/$/, '');
    }
    return window.location.origin;
  }

  // بررسی اینکه آیا عکس باید نمایش داده شود یا نه
  shouldShowThumb(course: TopCourse): boolean {
    const id = course._id || course.title;
    return !!course.thumbnail && !this.brokenThumbs()[id];
  }

  // وقتی عکس از سمت سرور خطای 404 بدهد، آن را خراب علامت می‌زنیم تا آیکون پیش‌فرض بیاید
  onThumbError(course: TopCourse, event: Event): void {
    const id = course._id || course.title;
    this.brokenThumbs.update((m) => ({ ...m, [id]: true }));
    const img = event.target as HTMLImageElement | null;
    if (img) img.onerror = null;
  }

  updateGreeting(): void {
    const hour = new Date().getHours();
    if (hour < 12) this.currentTime.set('صبح بخیر');
    else if (hour < 17) this.currentTime.set('ظهر بخیر');
    else if (hour < 20) this.currentTime.set('عصر بخیر');
    else this.currentTime.set('شب بخیر');
  }

  setPeriod(period: string): void {
    this.selectedPeriod.set(period);
  }

  openCourse(course: TopCourse): void {
    if (!course._id) return;
    this.router.navigate(['/instructor/course-builder', course._id]);
  }

  getGrowthPercentage(current: number, previous: number): number {
    if (!previous || previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  displayStats = computed(() => {
    const data = this.stats() || {};
    return {
      totalCourses: data.courses?.total || 0,
      publishedCourses: data.courses?.published || 0,
      draftCourses: data.courses?.draft || 0,
      pendingCourses: data.courses?.pending || 0,
      totalStudents: data.students || 0,
      totalRevenue: data.revenue || 0,
      averageRating: data.averageRating || 0,
      totalReviews: data.reviews || 0,
      completionRate: data.completionRate || 0,
      monthlyGrowth: data.growth || 0,
    };
  });

  get skeletonArray(): number[] {
    return Array(4)
      .fill(0)
      .map((_, i) => i);
  }

  trackByCourse(index: number, course: TopCourse): string {
    return course._id || index.toString();
  }

  statusLabel(status?: string): string {
    switch (status) {
      case 'published':
        return 'منتشر شده';
      case 'pending':
        return 'در انتظار تایید';
      case 'draft':
        return 'پیش‌نویس';
      case 'rejected':
        return 'رد شده';
      case 'archived':
        return 'بایگانی';
      default:
        return status || '';
    }
  }
}
