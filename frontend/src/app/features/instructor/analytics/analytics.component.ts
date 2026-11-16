import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

interface PeriodOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    TomanPipe,
    JalaliDatePipe,
    ImageFallbackDirective,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  stats = signal<any>(null);
  isLoading = signal<boolean>(true);
  selectedPeriod = signal<string>('month');
  activeChart = signal<'revenue' | 'students'>('revenue');

  periods: PeriodOption[] = [
    { value: 'week', label: 'هفته' },
    { value: 'month', label: 'ماه' },
    { value: 'year', label: 'سال' },
    { value: 'all', label: 'کل' },
  ];

  monthNames: Record<number, string> = {
    1: 'فروردین',
    2: 'اردیبهشت',
    3: 'خرداد',
    4: 'تیر',
    5: 'مرداد',
    6: 'شهریور',
    7: 'مهر',
    8: 'آبان',
    9: 'آذر',
    10: 'دی',
    11: 'بهمن',
    12: 'اسفند',
  };

  constructor(
    private api: ApiService,
    public authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadAnalytics();
  }

  loadAnalytics(): void {
    this.isLoading.set(true);
    this.api.get<any>('/dashboard/instructor').subscribe({
      next: (res) => {
        if (res.success && res.data) this.stats.set(res.data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  setPeriod(period: string): void {
    this.selectedPeriod.set(period);
    // Optional: reload with period param
    // this.api.get('/dashboard/instructor', { period }).subscribe(...)
  }

  setChart(type: 'revenue' | 'students'): void {
    this.activeChart.set(type);
  }

  // ── Computed display data ──────────────────────────────────
  display = computed(() => {
    const d = this.stats() || {};
    return {
      totalRevenue: d.revenue || 0,
      monthlyRevenue: d.monthlyRevenue || [],
      recentEnrollments: d.recentEnrollments || [],
      totalStudents: d.students || 0,
      totalCourses: d.courses?.total || 0,
      publishedCourses: d.courses?.published || 0,
      averageRating: d.averageRating || 0,
      totalReviews: d.reviews || 0,
      completionRate: d.completionRate || 0,
      topCourses: d.topCourses || [],
      growth: d.growth || 0,
    };
  });

  /** Max monthly revenue for bar width calculation */
  maxMonthlyRevenue = computed(() => {
    const months = this.display().monthlyRevenue as any[];
    if (!months?.length) return 1;
    return Math.max(...months.map((m) => m.total || 0), 1);
  });

  /** Sorted monthly revenue (oldest → newest or by _id) */
  chartMonths = computed(() => {
    const months = [...(this.display().monthlyRevenue as any[])];
    return months
      .sort((a, b) => Number(a._id) - Number(b._id))
      .map((m) => ({
        id: m._id,
        label: this.monthNames[Number(m._id)] || `ماه ${m._id}`,
        total: m.total || 0,
        percent: Math.round(((m.total || 0) / this.maxMonthlyRevenue()) * 100),
      }));
  });

  /** Total of visible chart bars */
  chartTotal = computed(() => this.chartMonths().reduce((sum, m) => sum + m.total, 0));

  revenueGrowth = computed(() => {
    const months = this.chartMonths();
    if (months.length < 2) return this.display().growth || 0;
    const last = months[months.length - 1]?.total || 0;
    const prev = months[months.length - 2]?.total || 1;
    if (prev === 0) return last > 0 ? 100 : 0;
    return Math.round(((last - prev) / prev) * 100);
  });

  getInitials(name: string): string {
    if (!name) return 'د';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : parts[0][0];
  }

  get skeletonArray(): number[] {
    return Array(4)
      .fill(0)
      .map((_, i) => i);
  }

  trackByMonth(_: number, m: any): string | number {
    return m.id;
  }

  trackByEnrollment(_: number, e: any): string {
    return e._id || e.student?._id || Math.random().toString();
  }

  trackByCourse(_: number, c: any): string {
    return c._id || c.title;
  }
}
