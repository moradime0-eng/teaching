import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { DiscussionService } from '../../../core/services/discussion.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { SocketService } from '../../../core/services/socket.service';
import {
  InstructorQuestion,
  InstructorQuestionCourse,
  InstructorQuestionStats,
} from '../../../core/models/discussion.model';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';

/**
 * 💬 صندوق پرسش و پاسخ مدرس
 * مدرس تمام پرسش‌های شرکت‌کنندگان دوره‌های خودش را اینجا می‌بیند و پاسخ می‌دهد.
 * ادمین هم به همین صفحه دسترسی دارد و پرسش‌های همه دوره‌ها را می‌بیند.
 */
@Component({
  selector: 'app-instructor-questions',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, JalaliDatePipe],
  templateUrl: './instructor-questions.component.html',
  styleUrl: './instructor-questions.component.scss',
})
export class InstructorQuestionsComponent implements OnInit, OnDestroy {
  private readonly discussionService = inject(DiscussionService);
  private readonly toastService = inject(ToastService);
  private readonly socketService = inject(SocketService);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly authService = inject(AuthService);

  // ── State ──
  readonly questions = signal<InstructorQuestion[]>([]);
  readonly courses = signal<InstructorQuestionCourse[]>([]);
  readonly stats = signal<InstructorQuestionStats>({ total: 0, unanswered: 0, answered: 0 });

  readonly isLoading = signal<boolean>(true);
  readonly isSending = signal<boolean>(false);
  readonly sendingFor = signal<string | null>(null);

  readonly statusFilter = signal<'all' | 'unanswered' | 'answered'>('unanswered');
  readonly courseFilter = signal<string>('all');
  readonly searchTerm = signal<string>('');
  readonly page = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalItems = signal<number>(0);

  /** پرسش‌هایی که پاسخ‌شان باز است */
  readonly openReplyFor = signal<string | null>(null);
  readonly replyDrafts = signal<Record<string, string>>({});

  readonly hasActiveFilters = computed(
    () =>
      this.courseFilter() !== 'all' ||
      this.statusFilter() !== 'unanswered' ||
      this.searchTerm().trim().length > 0,
  );

  /** ادمین به همه دوره‌ها دسترسی دارد؛ عنوان و توضیح صفحه بر همین اساس فرق می‌کند */
  readonly isAdminView = computed(() => this.authService.isAdmin());

  readonly pageTitle = computed(() =>
    this.isAdminView() ? 'مدیریت پرسش و پاسخ دوره‌ها' : 'پرسش و پاسخ',
  );

  readonly pageSubtitle = computed(() =>
    this.isAdminView()
      ? 'پرسش‌های شرکت‌کنندگان در تمام دوره‌های پلتفرم را مشاهده و پاسخ دهید.'
      : 'پرسش‌های شرکت‌کنندگان دوره‌های شما را اینجا ببینید و پاسخ دهید.',
  );

  /** برچسب دکمه بازگشت بر اساس نقش کاربر */
  readonly backLinkLabel = computed(() =>
    this.isAdminView() ? 'پنل مدیریت' : 'پنل مدرس',
  );

  readonly backLinkRoute = computed(() =>
    this.isAdminView() ? '/admin/dashboard' : '/instructor/dashboard',
  );

  /** مرجع لیسنر سوکت — برای حذف دقیق هنگام تخریب کامپوننت */
  private readonly onNewQuestion = () => {
    this.loadStats();
    if (this.statusFilter() === 'unanswered') this.loadQuestions();
  };

  ngOnInit(): void {
    // پشتیبانی از لینک نوتیفیکیشن: /instructor/questions?course=xxx
    const courseFromUrl = this.activatedRoute.snapshot.queryParamMap.get('course');
    if (courseFromUrl) {
      this.courseFilter.set(courseFromUrl);
    }

    this.loadCourses();
    this.loadStats();
    this.loadQuestions();

    // پرسش جدید در کلاس‌روم → بدون رفرش نمایش داده شود
    this.socketService.on('qa:new-question', this.onNewQuestion);
  }

  ngOnDestroy(): void {
    // ⚠️ FIX: حذف فقط لیسنر خودمان (قبلاً لیسنرهای دیگر هم پاک می‌شد)
    this.socketService.off('qa:new-question', this.onNewQuestion);
  }

  // ═══════════════════════════════════════════
  //  Data loading
  // ═══════════════════════════════════════════

  private loadCourses(): void {
    this.discussionService.getInstructorQuestionCourses().subscribe({
      next: (res) => {
        if (res?.success) this.courses.set(res.data || []);
      },
      error: () => this.courses.set([]),
    });
  }

  private loadStats(): void {
    this.discussionService.getInstructorQuestionStats().subscribe({
      next: (res) => {
        if (res?.success && res.data) this.stats.set(res.data);
      },
      error: () => this.stats.set({ total: 0, unanswered: 0, answered: 0 }),
    });
  }

  loadQuestions(): void {
    this.isLoading.set(true);
    this.discussionService
      .getInstructorQuestions({
        courseId: this.courseFilter(),
        status: this.statusFilter(),
        q: this.searchTerm(),
        page: this.page(),
        limit: 20,
      })
      .subscribe({
        next: (res) => {
          if (res?.success) {
            this.questions.set(res.data || []);
            this.totalItems.set(res.meta?.total ?? (res.data?.length ?? 0));
            this.totalPages.set(res.meta?.totalPages ?? 1);
          }
          this.isLoading.set(false);
        },
        error: (err) => {
          this.questions.set([]);
          this.isLoading.set(false);
          this.toastService.error(
            err?.error?.message || 'بارگذاری پرسش‌ها ناموفق بود',
          );
        },
      });
  }

  // ═══════════════════════════════════════════
  //  Filters
  // ═══════════════════════════════════════════

  setStatusFilter(status: 'all' | 'unanswered' | 'answered'): void {
    if (this.statusFilter() === status) return;
    this.statusFilter.set(status);
    this.page.set(1);
    this.loadQuestions();
  }

  setCourseFilter(courseId: string): void {
    if (this.courseFilter() === courseId) return;
    this.courseFilter.set(courseId);
    this.page.set(1);
    this.loadQuestions();
  }

  onSearch(value: string): void {
    this.searchTerm.set(value);
    this.page.set(1);
    this.debouncedSearch();
  }

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private debouncedSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.loadQuestions(), 400);
  }

  clearFilters(): void {
    this.courseFilter.set('all');
    this.statusFilter.set('all');
    this.searchTerm.set('');
    this.page.set(1);
    this.loadQuestions();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.loadQuestions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  get pages(): number[] {
    const total = this.totalPages();
    const current = this.page();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const out: number[] = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }

  // ═══════════════════════════════════════════
  //  Reply
  // ═══════════════════════════════════════════

  toggleReply(questionId: string): void {
    this.openReplyFor.update((cur) => (cur === questionId ? null : questionId));
  }

  setReplyDraft(questionId: string, value: string): void {
    this.replyDrafts.update((drafts) => ({ ...drafts, [questionId]: value }));
  }

  submitReply(questionId: string): void {
    const content = (this.replyDrafts()[questionId] || '').trim();
    if (!content) {
      this.toastService.warning('متن پاسخ را بنویسید');
      return;
    }
    if (this.sendingFor() === questionId) return;

    this.sendingFor.set(questionId);
    this.discussionService.addReply(questionId, content).subscribe({
      next: (res) => {
        this.sendingFor.set(null);
        if (res?.success) {
          // به‌روزرسانی محلی پرسش
          this.questions.update((list) =>
            list.map((q) => {
              if (q._id !== questionId) return q;
              const updated = res.data!;
              return {
                ...q,
                ...updated,
                replies: updated.replies || [],
                hasInstructorReply: true,
              } as InstructorQuestion;
            }),
          );
          this.setReplyDraft(questionId, '');
          this.openReplyFor.set(null);
          this.toastService.success(res.message || 'پاسخ شما ثبت شد');
          this.loadStats();
        } else {
          this.toastService.error(res?.message || 'ثبت پاسخ ناموفق بود');
        }
      },
      error: (err) => {
        this.sendingFor.set(null);
        this.toastService.error(err?.error?.message || 'خطا در ثبت پاسخ');
      },
    });
  }

  // ═══════════════════════════════════════════
  //  Moderation
  // ═══════════════════════════════════════════

  togglePin(question: InstructorQuestion): void {
    this.discussionService.moderateDiscussion(question._id, { isPinned: !question.isPinned }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.questions.update((list) =>
            list.map((q) => (q._id === question._id ? { ...q, isPinned: !q.isPinned } : q)),
          );
          this.toastService.success(res.message || 'به‌روزرسانی شد');
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'خطا در تغییر وضعیت'),
    });
  }

  toggleResolved(question: InstructorQuestion): void {
    this.discussionService
      .moderateDiscussion(question._id, { isResolved: !question.isResolved })
      .subscribe({
        next: (res) => {
          if (res?.success) {
            this.questions.update((list) =>
              list.map((q) => (q._id === question._id ? { ...q, isResolved: !q.isResolved } : q)),
            );
            this.toastService.success(res.message || 'به‌روزرسانی شد');
          }
        },
        error: (err) => this.toastService.error(err?.error?.message || 'خطا در تغییر وضعیت'),
      });
  }

  deleteQuestion(question: InstructorQuestion): void {
    if (!confirm('آیا از حذف این پرسش مطمئن هستید؟')) return;

    this.discussionService.deleteDiscussion(question._id).subscribe({
      next: (res) => {
        if (res?.success) {
          this.questions.update((list) => list.filter((q) => q._id !== question._id));
          this.totalItems.update((n) => Math.max(0, n - 1));
          this.toastService.success(res.message || 'پرسش حذف شد');
          this.loadStats();
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'حذف پرسش ناموفق بود'),
    });
  }

  // ═══════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════

  courseName(id: string | null): string {
    if (!id) return 'دوره نامشخص';
    return this.courses().find((c) => c._id === id)?.title || 'دوره نامشخص';
  }

  getInitials(name?: string): string {
    if (!name) return '؟';
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('');
  }

  /** رفتن به کلاس‌روم روی همان درس */
  goToClassroom(question: InstructorQuestion): void {
    if (!question.courseId) {
      this.toastService.warning('برای این پرسش دوره‌ای ثبت نشده است');
      return;
    }
    const url = `/learn/${question.courseSlug || question.courseId}`;
    this.router.navigate([url], {
      queryParams: question.lecture ? { lecture: question.lecture } : undefined,
    });
  }
}