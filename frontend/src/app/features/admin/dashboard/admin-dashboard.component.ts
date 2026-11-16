import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { DiscussionService } from '../../../core/services/discussion.service';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';

interface QuickLink {
  label: string;
  description: string;
  icon: string;
  route: string;
  color: string;
  badge?: number;
}

interface ActivityItem {
  type: string;
  icon: string;
  color: string;
  title: string;
  description: string;
  time: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, TomanPipe, JalaliDatePipe],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private readonly discussionService = inject(DiscussionService);

  stats = signal<any>(null);
  isLoading = signal<boolean>(true);
  currentTime = signal<string>('');
  selectedPeriod = signal<string>('month');

  /** تعداد پرسش‌های بی‌پاسخ در کل پلتفرم (برای نشان روی لینک پرسش و پاسخ) */
  unansweredQuestions = signal<number>(0);

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
    this.updateGreeting();
    this.loadDashboard();
    this.loadQuestionStats();
  }

  /** آمار پرسش‌های بی‌پاسخ — ادمین به همه دوره‌ها دسترسی دارد */
  private loadQuestionStats(): void {
    this.discussionService.getInstructorQuestionStats().subscribe({
      next: (res) => {
        if (res?.success && res.data) this.unansweredQuestions.set(res.data.unanswered || 0);
      },
      error: () => this.unansweredQuestions.set(0),
    });
  }

  loadDashboard(): void {
    this.isLoading.set(true);
    this.api.get<any>('/dashboard/admin').subscribe({
      next: (res) => {
        if (res.success && res.data) this.stats.set(res.data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
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

  displayStats = computed(() => {
    const d = this.stats() || {};
    return {
      totalUsers: d.users?.total || 0,
      newUsers: d.users?.newThisMonth || 0,
      totalCourses: d.courses?.total || 0,
      pendingCourses: d.courses?.pending || 0,
      publishedCourses: d.courses?.published || 0,
      totalRevenue: d.revenue?.total || 0,
      monthlyRevenue: d.revenue?.thisMonth || 0,
      openTickets: d.tickets?.open || 0,
      totalTickets: d.tickets?.total || 0,
      totalOrders: d.orders?.total || 0,
      pendingOrders: d.orders?.pending || 0,
      totalInstructors: d.instructors?.total || 0,
    };
  });

  quickLinks = computed<QuickLink[]>(() => {
    const s = this.displayStats();
    return [
      {
        label: 'مدیریت کاربران',
        description: 'مشاهده و مدیریت کاربران سیستم',
        icon: 'group',
        route: '/admin/users',
        color: 'blue',
      },
      {
        label: 'مدیریت دوره‌ها',
        description: 'بررسی و تأیید دوره‌های آموزشی',
        icon: 'library_books',
        route: '/admin/courses',
        color: 'purple',
        badge: s.pendingCourses > 0 ? s.pendingCourses : undefined,
      },
      {
        label: 'مسیرهای یادگیری',
        description: 'ساخت و مدیریت مسیرهای یادگیری',
        icon: 'route',
        route: '/admin/learning-paths',
        color: 'purple',
      },
      {
        label: 'تراکنش‌های مالی',
        description: 'مشاهده پرداخت‌ها و تسویه‌ها',
        icon: 'account_balance_wallet',
        route: '/admin/payments',
        color: 'green',
      },
      {
        label: 'تیکت‌های پشتیبانی',
        description: 'پاسخ به درخواست‌های کاربران',
        icon: 'support_agent',
        route: '/admin/tickets',
        color: 'rose',
        badge: s.openTickets > 0 ? s.openTickets : undefined,
      },
      {
        label: 'مدیریت پرسش و پاسخ',
        description: 'پاسخ به پرسش‌های شرکت‌کنندگان دوره‌ها',
        icon: 'question_answer',
        route: '/admin/questions',
        color: 'amber',
        badge: this.unansweredQuestions() > 0 ? this.unansweredQuestions() : undefined,
      },
      {
        label: 'مدیریت دسته‌بندی‌ها',
        description: 'ساختار و دسته‌بندی دوره‌ها',
        icon: 'category',
        route: '/admin/categories',
        color: 'amber',
      },
      {
        label: 'کمپین‌های تخفیف',
        description: 'مدیریت کمپین‌های فلش سیلی (Flash Sale)',
        icon: 'local_offer',
        route: '/admin/campaigns',
        color: 'deep-orange',
      },
      {
        label: 'تنظیمات سیستم',
        description: 'پیکربندی عمومی پلتفرم',
        icon: 'settings',
        route: '/admin/settings',
        color: 'slate',
      },
    ];
  });

  // Recent activities from API or empty
  recentActivities = computed<ActivityItem[]>(() => {
    const d = this.stats();
    if (d?.recentActivities && Array.isArray(d.recentActivities)) {
      return d.recentActivities;
    }
    return [];
  });

  // Alerts / attention items
  alerts = computed(() => {
    const s = this.displayStats();
    const items: { icon: string; color: string; title: string; desc: string; route: string }[] = [];

    if (s.pendingCourses > 0) {
      items.push({
        icon: 'pending_actions',
        color: 'amber',
        title: `${s.pendingCourses} دوره در انتظار تأیید`,
        desc: 'دوره‌های جدید نیاز به بررسی دارند',
        route: '/admin/courses',
      });
    }
    if (s.openTickets > 0) {
      items.push({
        icon: 'mark_email_unread',
        color: 'rose',
        title: `${s.openTickets} تیکت باز`,
        desc: 'درخواست‌های پشتیبانی بدون پاسخ',
        route: '/support',
      });
    }
    if (s.pendingOrders > 0) {
      items.push({
        icon: 'shopping_bag',
        color: 'blue',
        title: `${s.pendingOrders} سفارش در انتظار`,
        desc: 'سفارش‌هایی که نیاز به بررسی دارند',
        route: '/admin/payments',
      });
    }
    return items;
  });

  get skeletonArray(): number[] {
    return Array(4)
      .fill(0)
      .map((_, i) => i);
  }

  get revenueGrowth(): number {
    const d = this.stats();
    if (!d?.revenue?.thisMonth || !d?.revenue?.lastMonth) return 0;
    const last = d.revenue.lastMonth || 1;
    return Math.round(((d.revenue.thisMonth - last) / last) * 100);
  }
}
