// frontend/src/app/features/learning-paths/learning-path-detail/learning-path-detail.component.ts

import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  HostListener,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { catchError, map, of, switchMap, forkJoin } from 'rxjs';

import {
  LearningPathService,
  ILearningPath,
  ILearningPathEnrollment,
  ICourseNode,
  ICourseRef,
  IStage,
} from '../../../services/learning-path.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { FaNumPipe } from '../../../shared/pipes/fa-num.pipe';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

@Component({
  selector: 'app-learning-path-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    DurationPipe,
    FaNumPipe,
    MarkdownPipe,
  ],
  templateUrl: './learning-path-detail.component.html',
  styleUrls: ['./learning-path-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LearningPathDetailComponent implements OnInit {
  private lpService = inject(LearningPathService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  // ─── State ───
  readonly path = signal<ILearningPath | null>(null);
  readonly enrollment = signal<ILearningPathEnrollment | null>(null);
  readonly loading = signal(true);
  readonly enrolling = signal(false);
  readonly completedCourseIds = signal<Set<string>>(new Set());

  /** مراحلی که توسط کاربر جمع شده‌اند */
  readonly collapsedStages = signal<Set<number>>(new Set());

  /** شاخص مرحلهٔ فعال برای ناوبری چسبان */
  readonly activeStageIndex = signal(0);

  /** نمایش نوار ناوبری چسبان پس از اسکرول از هیرو */
  readonly showStickyNav = signal(false);

  // ─── مسیرهای پیشنهادی ───
  readonly relatedPaths = signal<ILearningPath[]>([]);
  readonly relatedLoading = signal(false);

  readonly suggestions = computed(() => {
    const currentId = this.path()?._id;
    return this.relatedPaths()
      .filter((p) => p._id !== currentId)
      .slice(0, 4);
  });

  readonly hasSuggestions = computed(() => !this.relatedLoading() && this.suggestions().length > 0);

  readonly isAuthenticated = this.authService.isAuthenticated;

  // ─── آمار محاسبه‌شده ───

  /** تعداد کل دوره‌های اجباری در مسیر */
  readonly totalRequiredCourses = computed(() => {
    const p = this.path();
    if (!p) return 0;
    return (p.stages || []).reduce(
      (sum, s) => sum + (s.courses || []).filter((c) => c.isRequired).length,
      0,
    );
  });

  /** تعداد دوره‌های اجباری تکمیل‌شده */
  readonly completedRequiredCourses = computed(() => {
    const p = this.path();
    if (!p) return 0;
    const done = this.completedCourseIds();
    return (p.stages || []).reduce(
      (sum, s) =>
        sum +
        (s.courses || []).filter((c) => {
          if (!c.isRequired) return false;
          const id = typeof c.course === 'string' ? c.course : (c.course as ICourseRef)?._id;
          return id ? done.has(id) : false;
        }).length,
      0,
    );
  });

  /** درصد پیشرفت کلی */
  readonly overallProgress = computed(() => {
    const enr = this.enrollment();
    if (enr?.progress != null) return enr.progress;
    const total = this.totalRequiredCourses();
    if (total === 0) return 0;
    return Math.round((this.completedRequiredCourses() / total) * 100);
  });

  /** تعداد کل دوره‌ها (اجباری + اختیاری) */
  readonly totalCoursesCount = computed(() => {
    const p = this.path();
    if (!p) return 0;
    const fromStages = (p.stages || []).reduce((s, st) => s + (st.courses?.length || 0), 0);
    return fromStages || p.totalCourses || 0;
  });

  // ─── Metadata ───
  readonly difficultyMeta: Record<
    string,
    { label: string; color: string; bg: string; icon: string }
  > = {
    beginner: { label: 'مبتدی', color: '#4e9f3d', bg: '#e7f2e2', icon: 'sentiment_satisfied' },
    intermediate: { label: 'متوسط', color: '#dd9a28', bg: '#f8eeda', icon: 'psychology' },
    advanced: { label: 'پیشرفته', color: '#d94f6a', bg: '#fae6ea', icon: 'military_tech' },
    mixed: { label: 'ترکیبی', color: '#6c5ce7', bg: '#eae7fb', icon: 'auto_awesome' },
  };

  get currentDifficulty() {
    const diff = this.path()?.difficulty || 'mixed';
    return this.difficultyMeta[diff];
  }

  // ═══════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      if (params['slug']) {
        this.loadPath(params['slug']);
      }
    });
    this.loadRelatedPaths();
  }

  ngOnDestroy(): void {
    // Cleanup for HostListener (Angular handles this automatically, but good practice)
  }

  // ═══════════════════════════════════════════
  //  Scroll spy — تشخیص مرحلهٔ فعال
  // ═══════════════════════════════════════════

  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // نمایش/مخفی‌سازی نوار چسبان
    const roadmap = document.getElementById('roadmap-section');
    if (roadmap) {
      const rect = roadmap.getBoundingClientRect();
      this.showStickyNav.set(rect.top < 120 && rect.bottom > 240);
    }

    // تشخیص مرحلهٔ فعال
    const stages = this.path()?.stages || [];
    let active = 0;
    for (let i = 0; i < stages.length; i++) {
      const el = document.getElementById(`stage-${i}`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.top <= 180) active = i;
      else break;
    }
    if (this.activeStageIndex() !== active) {
      this.activeStageIndex.set(active);
    }
  }

  // ═══════════════════════════════════════════
  //  Data loading
  // ═══════════════════════════════════════════

  private loadRelatedPaths(): void {
    this.relatedLoading.set(true);

    // Fetch both featured and recent paths in parallel to avoid race conditions
    // and avoid polluting the service's internal paths signal
    forkJoin({
      featured: this.lpService.getAll({ limit: 7, sort: '-enrolledStudents' }),
      recent: this.lpService.getAll({ limit: 7, sort: '-createdAt' }),
    })
      .pipe(
        map(({ featured, recent }) => {
          const featuredList: ILearningPath[] = featured?.data || [];
          const recentList: ILearningPath[] = recent?.data || [];
          
          // Combine and deduplicate
          const combined = [...featuredList, ...recentList];
          const seen = new Set<string>();
          return combined.filter((p) => {
            if (!p?._id || seen.has(p._id)) return false;
            seen.add(p._id);
            return true;
          }).slice(0, 4); // Limit to 4 for suggestions
        }),
        catchError(() => of([] as ILearningPath[])),
      )
      .subscribe((list) => {
        this.relatedPaths.set(list);
        this.relatedLoading.set(false);
      });
  }

  private loadPath(slug: string): void {
    this.loading.set(true);
    this.lpService.getBySlug(slug).subscribe({
      next: (res: any) => {
        this.path.set(res.data);

        if (res.data.userEnrollment) {
          this.enrollment.set(res.data.userEnrollment);
          const completedSet = new Set<string>();
          if (res.data.userEnrollment.completedCourses) {
            res.data.userEnrollment.completedCourses.forEach((cc: any) => {
              const courseId = typeof cc.course === 'string' ? cc.course : cc.course?._id;
              if (courseId) completedSet.add(courseId);
            });
          }
          this.completedCourseIds.set(completedSet);
        } else {
          this.enrollment.set(null);
          this.completedCourseIds.set(new Set());
        }

        this.collapsedStages.set(new Set());
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('مسیر یادگیری یافت نشد');
        this.router.navigate(['/learning-paths']);
      },
    });
  }

  // ═══════════════════════════════════════════
  //  Actions
  // ═══════════════════════════════════════════

  enroll(): void {
    if (!this.path()?._id) return;
    if (!this.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.enrolling.set(true);
    this.lpService.enroll(this.path()!._id!).subscribe({
      next: () => {
        this.enrolling.set(false);
        this.toast.success('ثبت‌نام موفقیت‌آمیز بود 🎉');
        this.loadPath(this.route.snapshot.params['slug']);
      },
      error: (err: any) => {
        this.enrolling.set(false);
        this.toast.error(err?.error?.message || 'خطا در ثبت‌نام');
      },
    });
  }

  scrollToRoadmap(): void {
    this.scrollToEl('roadmap-section', 100);
  }

  scrollToStage(index: number): void {
    this.scrollToEl(`stage-${index}`, 140);
  }

  private scrollToEl(id: string, offset: number): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  toggleStage(index: number): void {
    const next = new Set(this.collapsedStages());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.collapsedStages.set(next);
  }

  isStageCollapsed(index: number): boolean {
    return this.collapsedStages().has(index);
  }

  expandAll(): void {
    this.collapsedStages.set(new Set());
  }

  collapseAll(): void {
    const all = (this.path()?.stages || []).map((_, i) => i);
    this.collapsedStages.set(new Set(all));
  }

  readonly allCollapsed = computed(() => {
    const total = this.path()?.stages?.length || 0;
    return total > 0 && this.collapsedStages().size === total;
  });

  // ═══════════════════════════════════════════
  //  Text helpers — رفع مشکل نمایش HTML خام
  // ═══════════════════════════════════════════

  /**
   * تبدیل HTML به متن ساده.
   * مشکل `<p>جنبه&nbsp;فقط&nbsp;تحلیلی&nbsp;دارد</p>` را حل می‌کند.
   */
  plainText(html?: string | null): string {
    if (!html) return '';
    return String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&zwnj;/gi, '\u200c')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** آیا این رشته محتوای معناداری دارد؟ (برای شرط @if) */
  hasText(html?: string | null): boolean {
    return this.plainText(html).length > 0;
  }

  // ═══════════════════════════════════════════
  //  Course helpers
  // ═══════════════════════════════════════════

  getCourseData(courseNode: ICourseNode): ICourseRef | null {
    if (!courseNode?.course) return null;
    return typeof courseNode.course === 'string' ? null : (courseNode.course as ICourseRef);
  }

  getCourseTitle(courseNode: ICourseNode): string {
    return (
      this.plainText(courseNode.customTitle) ||
      this.getCourseData(courseNode)?.title ||
      'دوره آموزشی'
    );
  }

  getCourseDuration(courseNode: ICourseNode): number {
    return courseNode.estimatedDuration || this.getCourseData(courseNode)?.totalDuration || 0;
  }

  getCourseLectures(courseNode: ICourseNode): number {
    const c = this.getCourseData(courseNode);
    return c?.totalLectures || c?.lessonsCount || 0;
  }

  getCourseRating(courseNode: ICourseNode): number {
    return this.getCourseData(courseNode)?.averageRating || 0;
  }

  getCourseStudents(courseNode: ICourseNode): number {
    return this.getCourseData(courseNode)?.totalStudents || 0;
  }

  getCourseHue(courseNode: ICourseNode): number {
    return this.getCourseData(courseNode)?.hue || 210;
  }

  getCourseIcon(courseNode: ICourseNode): string {
    return this.getCourseData(courseNode)?.icon || '📚';
  }

  getCourseSlug(courseNode: ICourseNode): string {
    return this.getCourseData(courseNode)?.slug || '';
  }

  getCourseThumb(courseNode: ICourseNode): string {
    return this.getCourseData(courseNode)?.thumbnail || '';
  }

  getInstructorName(courseNode: ICourseNode): string {
    return this.getCourseData(courseNode)?.instructor?.fullName || '';
  }

  isCourseCompleted(courseNode: ICourseNode): boolean {
    const id =
      typeof courseNode.course === 'string'
        ? courseNode.course
        : (courseNode.course as ICourseRef)?._id;
    return id ? this.completedCourseIds().has(id) : false;
  }

  // ═══════════════════════════════════════════
  //  Stage helpers
  // ═══════════════════════════════════════════

  getStageProgress(stage: IStage): number {
    const required = (stage.courses || []).filter((cn) => cn.isRequired);
    if (required.length === 0) return 0;
    const completed = required.filter((cn) => this.isCourseCompleted(cn)).length;
    return Math.round((completed / required.length) * 100);
  }

  getStageDuration(stage: IStage): number {
    return (stage.courses || []).reduce((sum, cn) => sum + this.getCourseDuration(cn), 0);
  }

  isStageCompleted(stage: IStage): boolean {
    return this.getStageProgress(stage) === 100;
  }

  /** محیط دایرهٔ حلقهٔ پیشرفت (r = 15.9) */
  readonly RING_CIRCUMFERENCE = 100;

  ringOffset(progress: number): number {
    return this.RING_CIRCUMFERENCE - (this.RING_CIRCUMFERENCE * progress) / 100;
  }

  // ═══════════════════════════════════════════
  //  Suggestion card helpers
  // ═══════════════════════════════════════════

  diffMeta(diff?: string) {
    return this.difficultyMeta[diff || 'mixed'] || this.difficultyMeta['mixed'];
  }

  stagesOf(p: ILearningPath): number {
    return p?.stages?.length || 0;
  }

  coursesOf(p: ILearningPath): number {
    if (p?.totalCourses) return p.totalCourses;
    return (p?.stages || []).reduce((sum, s) => sum + (s.courses?.length || 0), 0);
  }

  stageColors(p: ILearningPath, max = 5): string[] {
    return (p?.stages || []).slice(0, max).map((s) => s.color || '#a435f0');
  }

  // ═══════════════════════════════════════════
  //  TrackBy
  // ═══════════════════════════════════════════

  trackStage = (i: number, s: IStage) => s._id || i;
  trackCourse = (i: number, c: ICourseNode) => c._id || i;
  trackPath = (i: number, p: ILearningPath) => p._id || i;
}