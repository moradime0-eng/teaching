// classroom.component.ts
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  HostListener,
  computed,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CourseService } from '../../../core/services/course.service';
import { ProgressService } from '../../../core/services/progress.service';
import { VideoUploadService } from '../../../core/services/video-upload.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { DiscussionService } from '../../../core/services/discussion.service';
import { Discussion } from '../../../core/models/discussion.model';
import {
  Course,
  Lecture,
  Section,
  Resource,
  Quiz,
} from '../../../core/models/course.model';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { ImageViewerComponent } from '../../../shared/components/image-viewer/image-viewer.component';
import { DurationPipe } from '../../../shared/pipes/duration.pipe';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';
import { environment } from '../../../../environments/environment.development';
import { isRawMediaUrl } from '../../../core/utils/media-guard.utils';

interface TabItem {
  id: string;
  label: string;
  icon: string;
}

interface QuizResult {
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  passingScore: number;
}

/** دلیل قفل بودن درس جاری */
type LectureLockReason = 'login' | 'enroll' | 'processing' | 'none';

@Component({
  selector: 'app-classroom',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    VideoPlayerComponent,
    ImageViewerComponent,
    DurationPipe,
    SanitizeHtmlPipe,
  ],
  templateUrl: './classroom.component.html',
  styleUrl: './classroom.component.scss',
})
export class ClassroomComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private courseService = inject(CourseService);
  private progressService = inject(ProgressService);
  private videoUploadService = inject(VideoUploadService);
  private authService = inject(AuthService);
  private discussionService = inject(DiscussionService);
  private api = inject(ApiService);
  private toastService = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  private platformId = inject(PLATFORM_ID);

  // ═══════════════ Core state ═══════════════
  course = signal<Course | null>(null);
  currentLecture = signal<Lecture | null>(null);
  completedLectures = signal<string[]>([]);
  videoUrl = signal<string>('');
  canAccess = signal<boolean>(false);
  isLoading = signal<boolean>(true);
  loadError = signal<string>('');
  /** شناسه درسی که از URL خواسته شده ولی در این دوره یافت نشد */
  invalidLectureId = signal<string | null>(null);
  /** جلوگیری از اجرای مجددِ دستور تغییر درس وقتی خودمان URL را آپدیت می‌کنیم */
  private suppressLectureParam = false;
  /** دوره‌ای که محتوایش بارگذاری شده — برای تشخیص تغییر مسیر */
  private loadedCourseId: string | null = null;
  accessChecked = signal<boolean>(false);
  private isFreeCourse = false;

  // ═══════════════ UI state ═══════════════
  isSidebarOpen = signal<boolean>(true);
  isMobileSidebarOpen = signal<boolean>(false);
  activeTab = signal<string>('overview');
  expandedSections = signal<Set<number>>(new Set([0]));
  searchQuery = signal<string>('');

  // ═══════════════ Notes ═══════════════
  noteContent = signal<string>('');
  isNotesSyncing = signal<boolean>(false);
  notesSyncedAt = signal<string>('');
  private noteSaveTimer: any = null;

  // ═══════════════ Auto-play ═══════════════
  autoPlayCountdown = signal<number>(0);
  autoPlayEnabled = signal<boolean>(true);
  private autoPlayTimer: any = null;

  // ═══════════════ Video position ═══════════════
  lastPosition = signal<number>(0);
  lastPositionByLecture = signal<Record<string, number>>({});
  quizScoreByLecture = signal<Record<string, number>>({});
  private lastPositionSentAt = 0;

  // ═══════════════ Quiz ═══════════════
  quizAnswers = signal<Record<number, number>>({});
  quizSubmitted = signal<boolean>(false);
  quizResult = signal<QuizResult | null>(null);
  isQuizSubmitting = signal<boolean>(false);
  quizSecondsLeft = signal<number>(0);
  private quizTimer: any = null;
  private quizTimerStartedFor = '';

  // ═══════════════ Assignment ═══════════════
  assignmentText = signal<string>('');
  assignmentFile = signal<File | null>(null);
  assignmentSubmitted = signal<boolean>(false);
  isSubmittingAssignment = signal<boolean>(false);

  // ═══════════════ Q&A ═══════════════
  discussions = signal<Discussion[]>([]);
  isLoadingDiscussions = signal<boolean>(false);
  qaScope = signal<'lecture' | 'course'>('lecture');
  qaComposerOpen = signal<boolean>(false);
  qaTitle = signal<string>('');
  qaContent = signal<string>('');
  isSubmittingQuestion = signal<boolean>(false);
  replyDrafts = signal<Record<string, string>>({});
  openReplyFor = signal<string | null>(null);
  votingKeys = signal<Set<string>>(new Set());

  // ═══════════════ Share / bookmark ═══════════════
  isShareOpen = signal<boolean>(false);
  isCourseBookmarked = signal<boolean>(false);
  isBookmarkBusy = signal<boolean>(false);
  private favoriteLectureIds = signal<Set<string>>(new Set());

  // ═══════════════ Lesson Preview Modal ═══════════════
  selectedLesson = signal<Lecture | null>(null);
  showLessonModal = signal<boolean>(false);
  lessonPreviewVideoUrl = signal<string>('');
  lessonPreviewError = signal<string>('');
  isLoadingLessonPreview = signal<boolean>(false);
  private lessonPreviewRefreshTimer: any = null;
  private readonly LESSON_PREVIEW_REFRESH_INTERVAL = 90 * 60 * 1000; // 90 minutes

  // ═══════════════ Image Viewer ═══════════════
  showImageViewer = signal<boolean>(false);
  imageViewerImages = signal<Array<{
    id: string;
    url: string;
    title?: string;
    description?: string;
    order: number;
  }>>([]);
  imageViewerInitialIndex = signal<number>(0);

  tabs: TabItem[] = [
    { id: 'overview', label: 'توضیحات', icon: 'description' },
    { id: 'notes', label: 'یادداشت‌ها', icon: 'sticky_note_2' },
    { id: 'resources', label: 'منابع', icon: 'folder' },
    { id: 'qa', label: 'پرسش و پاسخ', icon: 'forum' },
  ];

  // ═══════════════════════════════════════════
  // Computed
  // ═══════════════════════════════════════════
  totalLectures = computed(() => {
    const c = this.course();
    if (!c) return 0;
    return c.sections?.reduce((sum, s) => sum + (s.lectures?.length || 0), 0) || 0;
  });

  progressPercent = computed(() => {
    const total = this.totalLectures();
    if (total === 0) return 0;
    return Math.min(100, Math.round((this.completedLectures().length / total) * 100));
  });

  currentLectureIndex = computed(() => {
    const c = this.course();
    const current = this.currentLecture();
    if (!c || !current) return { section: 0, lecture: 0, global: 0 };

    let global = 0;
    for (let s = 0; s < (c.sections?.length || 0); s++) {
      const section = c.sections![s];
      for (let l = 0; l < (section.lectures?.length || 0); l++) {
        if (section.lectures![l]._id === current._id) {
          return { section: s, lecture: l, global };
        }
        global++;
      }
    }
    return { section: 0, lecture: 0, global: 0 };
  });

  hasPrevious = computed(() => this.currentLectureIndex().global > 0);
  hasNext = computed(() => this.currentLectureIndex().global < this.totalLectures() - 1);

  filteredSections = computed(() => {
    const c = this.course();
    const query = this.searchQuery().trim().toLowerCase();
    if (!c?.sections) return [];
    if (!query) return c.sections;

    return c.sections
      .map((section) => ({
        ...section,
        lectures:
          section.lectures?.filter(
            (l) =>
              l.title?.toLowerCase().includes(query) ||
              (l.description || '').toLowerCase().includes(query),
          ) || [],
      }))
      .filter((s) => s.lectures.length > 0);
  });

  /** آیا کاربر اجازه تعامل (پرسش/یادداشت/آزمون) دارد؟ */
  canInteract = computed(() => this.authService.isAuthenticated());

  /** دلیل قفل بودن درس جاری */
  lectureLockReason = computed<LectureLockReason>(() => {
    if (!this.accessChecked()) return 'none';
    if (!this.authService.isAuthenticated()) return 'login';
    if (!this.canAccess()) return 'enroll';
    const lecture = this.currentLecture();
    const status = lecture?.processing?.status;
    // ✅ اگر فایل ویدیویی در S3 موجود باشد، حتی با status=PENDING هم قابل پخش است
    // (پردازش سمت سرور هنوز آپدیت نشده ولی فایل آماده است)
    // Also check contentItems for video
    const hasVideo = !!lecture?.videoUrl || !!lecture?.storage?.key || this.hasVideoContentItem(lecture!);
    if ((status === 'PENDING' || status === 'UPLOADING' || status === 'PROCESSING') && !hasVideo) {
      return 'processing';
    }
    return 'none';
  });

  isLectureLocked = computed(() => this.lectureLockReason() !== 'none');

  lockTitle = computed(() => {
    switch (this.lectureLockReason()) {
      case 'login':
        return 'برای مشاهده این درس وارد شوید';
      case 'enroll':
        return 'این درس برای دانشجویان ثبت‌نام‌شده در دوره در دسترس است';
      case 'processing':
        return 'این ویدیو در حال آماده‌سازی است';
      default:
        return '';
    }
  });

  lockHint = computed(() => {
    switch (this.lectureLockReason()) {
      case 'login':
        return 'با ورود به حساب کاربری می‌توانید یادداشت بردارید، آزمون بدهید و از پرسش و پاسخ استفاده کنید.';
      case 'enroll':
        return 'با ثبت‌نام در این دوره، تمام درس‌ها و امکانات آموزشی آن برای شما فعال می‌شود.';
      case 'processing':
        return 'پس از پایان پردازش ویدیو، بدون نیاز به تازه‌سازی صفحه نمایش داده می‌شود.';
      default:
        return '';
    }
  });

  currentQuiz = computed<Quiz | null>(() => {
    const l = this.currentLecture();
    if (l?.type === 'quiz' && l.quiz?.questions?.length) return l.quiz;
    return null;
  });

  hasQuiz = computed(() => !!this.currentQuiz());

  answeredQuizCount = computed(
    () => Object.keys(this.quizAnswers()).filter((k) => this.quizAnswers()[+k] !== undefined).length,
  );

  allQuizAnswered = computed(() => {
    const quiz = this.currentQuiz();
    if (!quiz) return false;
    return quiz.questions.every((_, i) => this.quizAnswers()[i] !== undefined);
  });

  /** موقعیت پخش ذخیره‌شده برای درس جاری (ادامه تماشا) */
  resumePosition = computed(() => {
    const id = this.currentLecture()?._id;
    return id ? this.lastPositionByLecture()[id] || 0 : 0;
  });

  instructorId = computed(() => this.course()?.instructor?._id || null);

  // ═══════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════
  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.add('classroom-active');
      if (window.innerWidth < 1280) {
        this.isSidebarOpen.set(false);
      }
    } else {
      // SSR: فقط اسکلت لودینگ رندر شود — درخواست‌های playback/progress
      // نیازمند کوکی مرورگر هستند و روی سرور باعث 401 و ریدایرکت می‌شوند.
      return;
    }

    const courseId = this.route.snapshot.paramMap.get('courseId');
    if (courseId) {
      this.loadedCourseId = courseId;
      this.loadCourseCurriculum(courseId);
    }

    // ناوبری به دورهٔ دیگر فقط پارامتر مسیر را عوض می‌کند و Angular همین کامپوننت را
    // دوباره استفاده می‌کند؛ پس باید تغییر پارامتر را بشنویم و محتوا را دوباره بارگذاری کنیم.
    this.route.paramMap.subscribe((params) => {
      const id = params.get('courseId');
      if (!id || id === this.loadedCourseId) return;
      this.loadedCourseId = id;
      this.loadCourseCurriculum(id);
    });

    // ناوبری به درس دیگر فقط query param را عوض می‌کند و Angular همین کامپوننت را
    // دوباره استفاده می‌کند؛ پس باید تغییر پارامتر را بشنویم و درس را عوض کنیم.
    this.route.queryParamMap.subscribe((params) => {
      const lectureId = params.get('lecture');
      if (!lectureId) return;
      // از به‌روزرسانی‌های خودمان (updateUrlLecture) جلوگیری می‌کنیم
      if (lectureId === this.currentLecture()?._id) return;
      if (this.suppressLectureParam) return;

      const course = this.course();
      if (!course || this.isLoading()) return;

      const lecture = this.findLectureById(course, lectureId);
      if (lecture) {
        this.invalidLectureId.set(null);
        this.selectLecture(lecture);
      } else {
        this.invalidLectureId.set(lectureId);
        this.toastService.warning('درسی که به آن اشاره شده بود در این دوره یافت نشد');
      }
    });
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('classroom-active');
      document.body.style.overflow = '';
    }
    this.clearUrlRefreshTimer();
    this.clearAutoPlayTimer();
    this.clearQuizTimer();
    if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
    this.saveNoteLocally();
    if (this.currentLecture() && this.lastPosition() > 0) {
      this.persistPosition(this.lastPosition());
    }
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (document.visibilityState === 'visible') {
      const timeSinceLastFetch = Date.now() - this.lastUrlFetchTime;
      if (timeSinceLastFetch > 10 * 60 * 1000 && this.currentLecture()) {
        this.refreshCurrentVideoUrl();
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement ||
      target?.isContentEditable
    ) {
      if (e.key === 'Escape') target.blur();
      return;
    }

    if (this.isOverlayOpen()) {
      if (e.key === 'Escape') this.closeOverlays();
      return;
    }

    if (e.key === 'ArrowLeft' && this.hasNext()) {
      e.preventDefault();
      this.nextLecture();
    } else if (e.key === 'ArrowRight' && this.hasPrevious()) {
      e.preventDefault();
      this.previousLecture();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      this.toggleSidebar();
    } else if (e.key === 'Escape') {
      this.isMobileSidebarOpen.set(false);
      this.isShareOpen.set(false);
    }
  }

  private isOverlayOpen(): boolean {
    return this.isShareOpen() || this.qaComposerOpen() || this.openReplyFor() !== null;
  }

  private closeOverlays(): void {
    this.isShareOpen.set(false);
    this.qaComposerOpen.set(false);
    this.openReplyFor.set(null);
  }

  // ═══════════════════════════════════════════
  // Layout
  // ═══════════════════════════════════════════
  toggleSidebar(): void {
    this.isSidebarOpen.update((v) => !v);
  }

  toggleMobileSidebar(): void {
    this.isMobileSidebarOpen.update((v) => !v);
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = this.isMobileSidebarOpen() ? 'hidden' : '';
    }
  }

  setActiveTab(tabId: string): void {
    if (this.activeTab() === tabId) return;
    this.activeTab.set(tabId);

    if (tabId === 'qa') this.loadDiscussions();
    if (tabId === 'overview' && this.currentQuiz()) this.startQuizTimer();

    if (isPlatformBrowser(this.platformId)) {
      document.querySelector('.cl-stage')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  focusSearch(): void {
    if (isPlatformBrowser(this.platformId) && window.innerWidth < 1024) {
      this.isMobileSidebarOpen.set(true);
    }
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('.cl-search input')?.focus();
    }, 140);
  }

  toggleSectionExpanded(index: number): void {
    this.expandedSections.update((set) => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  isSectionExpanded(index: number): boolean {
    return this.expandedSections().has(index);
  }

  getSectionProgress(section: Section): number {
    const total = section.lectures?.length || 0;
    if (total === 0) return 0;
    return Math.round((this.getSectionCompletedCount(section) / total) * 100);
  }

  getSectionCompletedCount(section: Section): number {
    return section.lectures?.filter((l) => this.completedLectures().includes(l._id)).length || 0;
  }

  getSectionDuration(section: Section): number {
    return section.lectures?.reduce((sum, l) => sum + (l.duration || 0), 0) || 0;
  }

  // ═══════════════════════════════════════════
  // Data loading
  // ═══════════════════════════════════════════
  loadCourseCurriculum(slugOrId: string): void {
    this.isLoading.set(true);
    this.loadError.set('');

    this.courseService.getCourseBySlug(slugOrId).subscribe({
      next: (res) => {
        if (!res.success || !res.data) {
          this.loadError.set(res.message || 'دوره مورد نظر یافت نشد');
          this.isLoading.set(false);
          return;
        }

        const course = res.data;
        this.course.set(course);
        this.isFreeCourse = !!course.isFree;

        if (course.isFree) {
          this.canAccess.set(true);
          this.accessChecked.set(true);
          if (this.authService.isAuthenticated()) this.loadProgress(slugOrId);
        } else if (this.authService.isAuthenticated()) {
          this.loadProgress(slugOrId);
        } else {
          this.canAccess.set(false);
          this.accessChecked.set(true);
        }

        // انتخاب درس: از query string یا اولین درس
        const requestedId = this.route.snapshot.queryParamMap.get('lecture');
        const firstLecture = course.sections?.[0]?.lectures?.[0];
        if (firstLecture) {
          let target = requestedId ? this.findLectureById(course, requestedId) : null;

          // اگر لینک حاوی درسِ نامعتبر/حذف‌شده بود، به‌جای افتادن خاموش روی
          // درس اول، به کاربر اطلاع می‌دهیم تا بداند درس مورد نظر پیدا نشد.
          if (requestedId && !target) {
            this.invalidLectureId.set(requestedId);
            this.toastService.warning(
              'درسی که به آن اشاره شده بود در این دوره یافت نشد؛ نخستین درس نمایش داده می‌شود.',
            );
          } else {
            this.invalidLectureId.set(null);
          }

          this.selectLecture(target || firstLecture);
        }

        this.expandedSections.update((set) => new Set([...set, this.currentLectureIndex().section]));
        this.restoreLocalNotes(slugOrId);
        this.checkBookmarkState();

        this.isLoading.set(false);
      },
      error: (err) => {
        this.loadError.set(
          err?.error?.message || 'خطا در بارگذاری دوره. لطفاً دوباره تلاش کنید.',
        );
        this.isLoading.set(false);
      },
    });
  }

  retryLoad(): void {
    const courseId = this.route.snapshot.paramMap.get('courseId');
    if (courseId) this.loadCourseCurriculum(courseId);
  }

  private findLectureById(course: Course, lectureId: string): Lecture | null {
    for (const section of course.sections || []) {
      const found = section.lectures?.find((l) => l._id === lectureId);
      if (found) return found;
    }
    return null;
  }

  loadProgress(courseId: string): void {
    this.progressService.getCourseProgress(courseId).subscribe({
      next: (res) => {
        if (res.success) {
          if (res.data?.enrollment) {
            this.completedLectures.set(res.data.enrollment.completedLectures || []);
            this.canAccess.set(true);
          } else if (this.isFreeCourse) {
            const completed = (res.data?.lectures || [])
              .filter((p: any) => p?.isCompleted && p?.lecture?._id)
              .map((p: any) => p.lecture._id);
            if (completed.length) this.completedLectures.set(completed);
            this.canAccess.set(true);
          }
          this.cacheProgressMeta(res.data?.lectures || []);
        }
        this.accessChecked.set(true);
      },
      error: () => {
        this.canAccess.set(this.isFreeCourse);
        this.accessChecked.set(true);
      },
    });
  }

  /** ذخیره نمره آزمون‌ها و موقعیت پخش برای ادامه تماشا */
  private cacheProgressMeta(records: any[]): void {
    const scores: Record<string, number> = {};
    const positions: Record<string, number> = {};

    for (const rec of records) {
      const id = rec?.lecture?._id;
      if (!id) continue;
      if (typeof rec.quizScore === 'number') scores[id] = rec.quizScore;
      if (typeof rec.lastPosition === 'number' && rec.lastPosition > 0) {
        positions[id] = rec.lastPosition;
      }
    }

    if (Object.keys(scores).length) this.quizScoreByLecture.set(scores);
    if (Object.keys(positions).length) this.lastPositionByLecture.set(positions);
  }

  private resetLectureScopedState(): void {
    this.clearQuizTimer();
    this.quizTimerStartedFor = '';
    this.quizAnswers.set({});
    this.quizSubmitted.set(false);
    this.quizResult.set(null);
    this.quizSecondsLeft.set(0);
    this.assignmentText.set('');
    this.assignmentFile.set(null);
    this.assignmentSubmitted.set(false);
    this.qaTitle.set('');
    this.qaContent.set('');
    this.qaComposerOpen.set(false);
    this.openReplyFor.set(null);
    this.replyDrafts.set({});
    this.discussions.set([]);
    this.lastPosition.set(0);
    this.notesSyncedAt.set('');
  }

  selectLecture(lecture: Lecture): void {
    if (!lecture) return;

    this.resetLectureScopedState();
    this.currentLecture.set(lecture);
    this.videoUrl.set('');
    this.clearUrlRefreshTimer();
    this.clearAutoPlayTimer();
    this.isMobileSidebarOpen.set(false);
    this.isShareOpen.set(false);

    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }

    this.expandedSections.update((set) => new Set([...set, this.currentLectureIndex().section]));
    this.loadNoteForLecture(lecture);
    this.lastPosition.set(this.resumePosition());

    if (this.activeTab() === 'qa') this.loadDiscussions();

    // ✅ FIX: همیشه تلاش کن URL پخش را بگیری
    if (!this.isLectureLocked()) {
      // اول contentItem ویدیویی را پیدا کن
      const videoItem = lecture.contentItems?.find(
        (item: any) => item.type === 'video' && (item.storage?.key || item.videoUrl)
      );

      // اگر ویدیو وجود دارد (legacy یا contentItem یا حتی type=video)
      if (lecture.videoUrl || lecture.storage?.key || videoItem || lecture.type === 'video') {
        this.fetchPlaybackUrl(lecture._id, videoItem?._id);
      }
    }

    this.updateUrlLecture(lecture._id);

    if (isPlatformBrowser(this.platformId)) {
      document.querySelector('.cl-stage')?.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        document
          .querySelector(`[data-lec="${lecture._id}"]`)
          ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 120);
    }
  }

  private updateUrlLecture(lectureId: string): void {
    if (!lectureId) return;
    // اگر URL از قبل همین درس را نشان می‌دهد، دست به URL نمی‌زنیم
    if (this.route.snapshot.queryParamMap.get('lecture') === lectureId) return;
    try {
      this.suppressLectureParam = true;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { lecture: lectureId },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } catch {
      // ناوبری بدون اهمیت (SSR یا خطای ناوبری)
    } finally {
      // آزادسازی بعد از اینکه router ناوبری را پردازش کند
      setTimeout(() => (this.suppressLectureParam = false), 0);
    }
  }

  // ═══════════════════════════════════════════
  // Video playback
  // ═══════════════════════════════════════════
  private urlRefreshTimer: any = null;
  private readonly URL_REFRESH_INTERVAL = 90 * 60 * 1000;
  private lastUrlFetchTime = 0;

  private fetchPlaybackUrl(lectureId: string, resourceId?: string): void {
    if (!lectureId || lectureId === 'undefined' || lectureId === 'null') return;

    this.videoUploadService.getPlaybackUrl(lectureId, resourceId).subscribe({
      next: (res: any) => {
        const url = res?.data?.url || res?.url || '';
        if (url && url !== 'null' && url !== 'undefined') {
          this.videoUrl.set(url);
          this.lastUrlFetchTime = Date.now();
          this.startUrlRefreshTimer();
        } else {
          // ❌ No URL returned from backend - don't fallback to unprotected URL
          // This would cause 401/403 errors. Let the video player handle the error
          // and trigger urlExpired event to refresh via refreshPlaybackUrl
          console.warn('[Classroom] No playback URL returned from backend for lecture:', lectureId);
        }
      },
      error: (err) => {
        // ❌ Don't fallback to unprotected URL - it will fail with 401/403
        // The video player will emit urlExpired event which triggers onVideoUrlExpired()
        // which calls refreshCurrentVideoUrl() to get a fresh token
        console.warn('[Classroom] Failed to fetch playback URL:', err?.message || err);
      },
    });
  }

  private startUrlRefreshTimer(): void {
    this.clearUrlRefreshTimer();
    this.urlRefreshTimer = setInterval(
      () => this.refreshCurrentVideoUrl(),
      this.URL_REFRESH_INTERVAL,
    );
  }

  private refreshCurrentVideoUrl(): void {
    const lecture = this.currentLecture();
    if (!lecture?._id || lecture._id === 'undefined' || lecture._id === 'null') return;
    
    // Find the video content item if exists
    const videoItem = lecture.contentItems?.find((item: any) => item.type === 'video' && (item.storage?.key || item.videoUrl));
    const resourceId = videoItem?._id;

    this.videoUploadService.refreshPlaybackUrl(lecture._id, resourceId).subscribe({
      next: (res: any) => {
        const url = res?.data?.url || res?.url || '';
        if (url && url !== 'null' && url !== 'undefined') {
          this.videoUrl.set(url);
          this.lastUrlFetchTime = Date.now();
        }
      },
      error: () => this.fetchPlaybackUrl(lecture._id),
    });
  }

  onVideoUrlExpired(): void {
    this.toastService.info('در حال تمدید لینک ویدیو…');
    this.refreshCurrentVideoUrl();
  }

  private clearUrlRefreshTimer(): void {
    if (this.urlRefreshTimer) {
      clearInterval(this.urlRefreshTimer);
      this.urlRefreshTimer = null;
    }
  }

  /** ذخیره موقعیت پخش (با throttle ۳۰ ثانیه) */
  onVideoProgressUpdate(evt: { position: number; duration: number }): void {
    if (!evt?.position) return;
    this.lastPosition.set(evt.position);

    if (this.isLectureLocked()) return;

    const now = Date.now();
    if (now - this.lastPositionSentAt < 30000) return;
    this.lastPositionSentAt = now;
    this.persistPosition(evt.position);
  }

  private persistPosition(position: number): void {
    const course = this.course();
    const lecture = this.currentLecture();
    if (!course || !lecture) return;

    this.progressService.sendProgressUpdate({
      courseId: course._id,
      lectureId: lecture._id,
      watchedDuration: position,
      lastPosition: position,
    });
  }

  onVideoCompleted(): void {
    const lecture = this.currentLecture();
    const course = this.course();
    if (!lecture || !course) return;

    if (this.isLectureCompleted(lecture._id)) {
      this.maybeAutoAdvance();
      return;
    }

    this.progressService
      .updateProgress({ courseId: course._id, lectureId: lecture._id, isCompleted: true })
      .subscribe({
        next: () => {
          this.completedLectures.update((list) => [...list, lecture._id]);
          this.maybeAutoAdvance();
        },
        error: () => this.toastService.error('ذخیره پیشرفت با خطا مواجه شد'),
      });
  }

  private maybeAutoAdvance(): void {
    if (!this.autoPlayEnabled() || !this.hasNext()) {
      if (this.progressPercent() >= 100) {
        this.toastService.success('تبریک! دوره را کامل کردید 🎉', 'دوره تمام شد');
      }
      return;
    }

    this.clearAutoPlayTimer();
    this.autoPlayCountdown.set(8);
    this.autoPlayTimer = setInterval(() => {
      const remaining = this.autoPlayCountdown();
      if (remaining <= 1) {
        this.clearAutoPlayTimer();
        this.autoPlayCountdown.set(0);
        this.nextLecture();
      } else {
        this.autoPlayCountdown.update((v) => v - 1);
      }
    }, 1000);
  }

  toggleAutoPlay(): void {
    this.autoPlayEnabled.update((v) => !v);
    if (!this.autoPlayEnabled()) this.cancelAutoPlay();
    this.toastService.info(
      this.autoPlayEnabled() ? 'پخش خودکار درس بعدی فعال شد' : 'پخش خودکار غیرفعال شد',
    );
  }

  // ═══════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════
  nextLecture(): void {
    const c = this.course();
    if (!c?.sections) return;
    const idx = this.currentLectureIndex();
    const currentSection = c.sections[idx.section];
    if (!currentSection) return;

    if (idx.lecture + 1 < (currentSection.lectures?.length || 0)) {
      this.selectLecture(currentSection.lectures![idx.lecture + 1]);
    } else if (idx.section + 1 < c.sections.length) {
      const nextSection = c.sections[idx.section + 1];
      if (nextSection.lectures?.[0]) this.selectLecture(nextSection.lectures[0]);
    }
  }

  previousLecture(): void {
    const c = this.course();
    if (!c?.sections) return;
    const idx = this.currentLectureIndex();

    if (idx.lecture > 0) {
      this.selectLecture(c.sections[idx.section].lectures![idx.lecture - 1]);
    } else if (idx.section > 0) {
      const prevSection = c.sections[idx.section - 1];
      const lastLecture = prevSection.lectures?.[prevSection.lectures.length - 1];
      if (lastLecture) this.selectLecture(lastLecture);
    }
  }

  // ═══════════════════════════════════════════
  // Completion
  // ═══════════════════════════════════════════
  toggleLectureComplete(lecture: Lecture, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    const course = this.course();
    if (!course || !lecture) return;

    if (this.isLectureLocked()) {
      this.toastService.warning('برای ثبت پیشرفت باید در دوره ثبت‌نام کنید');
      return;
    }

    const wasCompleted = this.isLectureCompleted(lecture._id);

    // بهینه‌سازی خوش‌بینانه
    this.completedLectures.update((list) =>
      wasCompleted ? list.filter((id) => id !== lecture._id) : [...list, lecture._id],
    );

    this.progressService
      .updateProgress({
        courseId: course._id,
        lectureId: lecture._id,
        isCompleted: !wasCompleted,
      })
      .subscribe({
        next: (res) => {
          this.toastService.success(
            res?.message || (wasCompleted ? 'تکمیل درس لغو شد' : 'درس تکمیل علامت‌گذاری شد'),
          );
          if (!wasCompleted && this.progressPercent() >= 100) {
            this.toastService.success('دوره را کامل کردید! 🎉', 'آفرین');
          }
        },
        error: () => {
          // بازگرداندن وضعیت قبلی در صورت خطا
          this.completedLectures.update((list) =>
            wasCompleted ? [...list, lecture._id] : list.filter((id) => id !== lecture._id),
          );
          this.toastService.error('ذخیره وضعیت تکمیل با خطا مواجه شد');
        },
      });
  }

  isLectureCompleted(lectureId: string): boolean {
    return this.completedLectures().includes(lectureId);
  }

  // ═══════════════════════════════════════════
  // Notes
  // ═══════════════════════════════════════════
  onNoteChange(value: string): void {
    this.noteContent.set(value);
    this.saveNoteLocally();
    if (this.noteSaveTimer) clearTimeout(this.noteSaveTimer);
    this.noteSaveTimer = setTimeout(() => this.syncNoteToServer(), 1500);
  }

  clearNote(): void {
    this.noteContent.set('');
    this.saveNoteLocally();
    this.notesSyncedAt.set('');
  }

  private syncNoteToServer(): void {
    const course = this.course();
    const lecture = this.currentLecture();
    if (!course || !lecture || !this.canInteract()) return;

    const content = this.noteContent().trim();
    if (!content) return;

    this.isNotesSyncing.set(true);
    this.progressService
      .addNote({
        courseId: course._id,
        lectureId: lecture._id,
        content: content.slice(0, 1000),
        timestamp: this.lastPosition(),
      })
      .subscribe({
        next: () => {
          this.isNotesSyncing.set(false);
          this.notesSyncedAt.set(new Date().toLocaleTimeString('fa-IR'));
        },
        error: () => {
          this.isNotesSyncing.set(false);
          this.toastService.warning('همگام‌سازی یادداشت با سرور ناموفق بود');
        },
      });
  }

  private get courseIdParam(): string | null {
    return this.route.snapshot.paramMap.get('courseId');
  }

  private loadNoteForLecture(lecture: Lecture): void {
    const courseId = this.courseIdParam;
    if (!courseId || !lecture?._id) {
      this.noteContent.set('');
      return;
    }
    this.noteContent.set(this.readLocalNotes(courseId)[lecture._id] || '');
  }

  private readLocalNotes(courseId: string): Record<string, string> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const parsed = JSON.parse(localStorage.getItem(`cl-notes:${courseId}`) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private saveNoteLocally(): void {
    const courseId = this.courseIdParam;
    const lectureId = this.currentLecture()?._id;
    if (typeof localStorage === 'undefined' || !courseId || !lectureId) return;
    try {
      const all = this.readLocalNotes(courseId);
      all[lectureId] = this.noteContent();
      localStorage.setItem(`cl-notes:${courseId}`, JSON.stringify(all));
    } catch {
      // سهمیه ذخیره‌سازی مرورگر پر است — نادیده گرفته می‌شود
    }
  }

  private restoreLocalNotes(_courseId: string): void {
    const lectureId = this.currentLecture()?._id;
    if (!lectureId) return;
    this.noteContent.set(this.readLocalNotes(_courseId)[lectureId] || '');
  }

  // ═══════════════════════════════════════════
  // Quiz
  // ═══════════════════════════════════════════
  selectQuizOption(qIndex: number, oIndex: number): void {
    if (this.quizSubmitted()) return;
    this.quizAnswers.update((ans) => ({ ...ans, [qIndex]: oIndex }));
  }

  quizOptionState(qIndex: number, oIndex: number): string {
    const quiz = this.currentQuiz();
    if (!quiz) return '';
    const selected = this.quizAnswers()[qIndex] === oIndex;

    if (!this.quizSubmitted()) return selected ? 'selected' : '';
    const correct = quiz.questions[qIndex]?.correctAnswer === oIndex;
    if (correct) return 'correct';
    if (selected) return 'wrong';
    return '';
  }

  submitQuiz(): void {
    const quiz = this.currentQuiz();
    const course = this.course();
    const lecture = this.currentLecture();
    if (!quiz || !course || !lecture || this.isQuizSubmitting()) return;

    if (!this.allQuizAnswered()) {
      this.toastService.warning('لطفاً به همه سؤالات پاسخ دهید');
      return;
    }

    const answers = quiz.questions.map((_, i) => this.quizAnswers()[i]);
    this.isQuizSubmitting.set(true);
    this.clearQuizTimer();

    this.progressService.submitQuiz({ courseId: course._id, lectureId: lecture._id, answers }).subscribe({
      next: (res: any) => {
        this.isQuizSubmitting.set(false);
        if (!res?.success || !res?.data) {
          this.toastService.error(res?.message || 'ثبت آزمون ناموفق بود');
          return;
        }

        const result: QuizResult = res.data;
        this.quizResult.set(result);
        this.quizSubmitted.set(true);
        this.quizScoreByLecture.update((scores) => ({ ...scores, [lecture._id]: result.score }));

        if (result.passed) {
          if (!this.completedLectures().includes(lecture._id)) {
            this.completedLectures.update((list) => [...list, lecture._id]);
          }
          this.toastService.success(res.message || 'آزمون را با موفقیت گذراندید 🎉', 'قبولی');
        } else {
          this.toastService.warning(
            `نمره شما ${result.score} است. حداقل نمره قبولی ${result.passingScore} است.`,
            'مردود',
          );
        }
      },
      error: (err) => {
        this.isQuizSubmitting.set(false);
        this.toastService.error(err?.error?.message || 'خطا در ثبت آزمون');
      },
    });
  }

  retryQuiz(): void {
    this.quizAnswers.set({});
    this.quizSubmitted.set(false);
    this.quizResult.set(null);
    this.quizTimerStartedFor = '';
    this.startQuizTimer();
  }

  /** تایمر آزمون (در صورت تعیین timeLimit) */
  startQuizTimer(): void {
    const quiz = this.currentQuiz();
    const lectureId = this.currentLecture()?._id;
    if (!quiz || !lectureId) return;
    if (this.quizTimerStartedFor === lectureId) return;

    this.quizTimerStartedFor = lectureId;
    this.clearQuizTimer();

    const timeLimit = quiz.timeLimit;
    if (!timeLimit || timeLimit <= 0) {
      this.quizSecondsLeft.set(0);
      return;
    }

    let remaining = timeLimit * 60;
    this.quizSecondsLeft.set(remaining);
    this.quizTimer = setInterval(() => {
      remaining = Math.max(0, remaining - 1);
      this.quizSecondsLeft.set(remaining);
      if (remaining <= 0) {
        this.clearQuizTimer();
        if (!this.quizSubmitted()) {
          if (this.allQuizAnswered()) this.submitQuiz();
          else this.toastService.warning('زمان آزمون تمام شد؛ آزمون ناقص ثبت نشد');
        }
      }
    }, 1000);
  }

  private clearQuizTimer(): void {
    if (this.quizTimer) {
      clearInterval(this.quizTimer);
      this.quizTimer = null;
    }
  }

  formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  get previousQuizScore(): number | null {
    const id = this.currentLecture()?._id;
    if (!id) return null;
    const score = this.quizScoreByLecture()[id];
    return typeof score === 'number' ? score : null;
  }

  // ═══════════════════════════════════════════
  // Assignment
  // ═══════════════════════════════════════════
  onAssignmentFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (file && file.size > 10 * 1024 * 1024) {
      this.toastService.error('حجم فایل نباید بیشتر از ۱۰ مگابایت باشد');
      input.value = '';
      return;
    }
    this.assignmentFile.set(file);
  }

  removeAssignmentFile(): void {
    this.assignmentFile.set(null);
  }

  get assignmentSubmissionType(): 'text' | 'file' | 'both' {
    return this.currentLecture()?.assignment?.submissionType || 'text';
  }

  get assignmentDueDate(): string | null {
    const due = this.currentLecture()?.assignment?.dueDate;
    return due ? new Date(due).toLocaleDateString('fa-IR') : null;
  }

  submitAssignment(): void {
    const course = this.course();
    const lecture = this.currentLecture();
    if (!course || !lecture || this.isSubmittingAssignment()) return;

    const text = this.assignmentText().trim();
    const file = this.assignmentFile();
    const type = this.assignmentSubmissionType;

    if (type !== 'file' && !text) {
      this.toastService.warning('متن پاسخ خود را بنویسید');
      return;
    }
    if (type === 'file' && !file) {
      this.toastService.warning('فایل پاسخ را انتخاب کنید');
      return;
    }

    this.isSubmittingAssignment.set(true);

    const send = (fileUrl?: string) =>
      this.api
        .post<any>('/progress/assignment', {
          courseId: course._id,
          lectureId: lecture._id,
          content: text,
          fileUrl,
        })
        .subscribe({
          next: (res: any) => {
            this.isSubmittingAssignment.set(false);
            if (res?.success) {
              this.assignmentSubmitted.set(true);
              this.toastService.success(res.message || 'تمرین شما با موفقیت ارسال شد');
            } else {
              this.toastService.error(res?.message || 'ارسال تمرین ناموفق بود');
            }
          },
          error: (err) => {
            this.isSubmittingAssignment.set(false);
            this.toastService.error(err?.error?.message || 'خطا در ارسال تمرین');
          },
        });

    if (file) {
      // ابتدا فایل آپلود و سپس ثبت تمرین
      const form = new FormData();
      form.append('file', file);
      this.api.upload<any>('/upload/document', form).subscribe({
        next: (res: any) => {
          const url = res?.data?.url || res?.data?.path || '';
          send(url);
        },
        error: () => {
          this.isSubmittingAssignment.set(false);
          this.toastService.error('آپلود فایل ناموفق بود');
        },
      });
    } else {
      send();
    }
  }

  // ═══════════════════════════════════════════
  // Q&A
  // ═══════════════════════════════════════════
  loadDiscussions(): void {
    const course = this.course();
    if (!course || !this.canInteract()) {
      this.discussions.set([]);
      return;
    }

    this.isLoadingDiscussions.set(true);
    const courseWide = this.qaScope() === 'course';
    const lectureId = courseWide ? null : this.currentLecture()?._id ?? null;

    this.discussionService.getCourseDiscussions(course._id, lectureId, courseWide).subscribe({
      next: (res) => {
        if (res?.success) this.discussions.set(res.data || []);
        this.isLoadingDiscussions.set(false);
      },
      error: () => {
        this.discussions.set([]);
        this.isLoadingDiscussions.set(false);
      },
    });
  }

  setQaScope(scope: 'lecture' | 'course'): void {
    if (this.qaScope() === scope) return;
    this.qaScope.set(scope);
    this.loadDiscussions();
  }

  openQaComposer(): void {
    if (!this.canInteract()) {
      this.toastService.info('برای طرح پرسش ابتدا وارد حساب کاربری شوید');
      return;
    }
    this.qaComposerOpen.set(true);
  }

  closeQaComposer(): void {
    this.qaComposerOpen.set(false);
  }

  submitQuestion(): void {
    const course = this.course();
    const content = this.qaContent().trim();
    if (!course) return;
    if (!content) {
      this.toastService.warning('متن پرسش را بنویسید');
      return;
    }
    if (this.isSubmittingQuestion()) return;

    this.isSubmittingQuestion.set(true);
    this.discussionService
      .createDiscussion({
        courseId: course._id,
        lectureId: this.currentLecture()?._id ?? null,
        title: this.qaTitle().trim() || undefined,
        content,
      })
      .subscribe({
        next: (res) => {
          this.isSubmittingQuestion.set(false);
          if (res?.success && res.data) {
            this.discussions.update((list) => [res.data!, ...list]);
            this.qaContent.set('');
            this.qaTitle.set('');
            this.qaComposerOpen.set(false);
            this.toastService.success(res.message || 'پرسش شما ثبت شد');
          } else {
            this.toastService.error(res?.message || 'ثبت پرسش ناموفق بود');
          }
        },
        error: (err) => {
          this.isSubmittingQuestion.set(false);
          this.toastService.error(err?.error?.message || 'خطا در ثبت پرسش');
        },
      });
  }

  toggleReplyBox(discussionId: string): void {
    this.openReplyFor.update((cur) => (cur === discussionId ? null : discussionId));
  }

  setReplyDraft(discussionId: string, value: string): void {
    this.replyDrafts.update((drafts) => ({ ...drafts, [discussionId]: value }));
  }

  submitReply(discussionId: string): void {
    const content = (this.replyDrafts()[discussionId] || '').trim();
    if (!content) {
      this.toastService.warning('متن پاسخ را بنویسید');
      return;
    }

    this.discussionService.addReply(discussionId, content).subscribe({
      next: (res) => {
        if (res?.success && res.data) {
          this.replaceDiscussion(res.data);
          this.setReplyDraft(discussionId, '');
          this.openReplyFor.set(null);
          this.toastService.success(res.message || 'پاسخ ثبت شد');
        } else {
          this.toastService.error(res?.message || 'ثبت پاسخ ناموفق بود');
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'خطا در ثبت پاسخ'),
    });
  }

  private replaceDiscussion(updated: Discussion): void {
    this.discussions.update((list) => list.map((d) => (d._id === updated._id ? updated : d)));
  }

  private voteKey(discussionId: string, replyId: string | null): string {
    return `${discussionId}:${replyId || 'q'}`;
  }

  isVoting(discussionId: string, replyId: string | null): boolean {
    return this.votingKeys().has(this.voteKey(discussionId, replyId));
  }

  vote(discussion: Discussion, replyId: string | null, value: 1 | -1): void {
    const key = this.voteKey(discussion._id, replyId);
    if (this.votingKeys().has(key)) return;

    this.votingKeys.update((s) => new Set([...s, key]));
    this.discussionService.voteDiscussion(discussion._id, value, replyId).subscribe({
      next: (res) => {
        this.votingKeys.update((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
        if (res?.success && res.data) this.replaceDiscussion(res.data);
      },
      error: (err) => {
        this.votingKeys.update((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
        this.toastService.error(err?.error?.message || 'ثبت رأی ناموفق بود');
      },
    });
  }

  deleteQuestion(discussionId: string): void {
    this.discussionService.deleteDiscussion(discussionId).subscribe({
      next: (res) => {
        if (res?.success) {
          this.discussions.update((list) => list.filter((d) => d._id !== discussionId));
          this.toastService.success(res.message || 'پرسش حذف شد');
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'حذف پرسش ناموفق بود'),
    });
  }

  canDeleteDiscussion(d: Discussion): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    // ادمین → همیشه
    if (user.role === 'admin') return true;
    // صاحب پرسش → می‌تواند پرسش خودش را حذف کند
    if (d.user?._id === user._id) return true;
    // مدرسِ همین دوره → می‌تواند پرسش‌های دوره خودش را مدیریت کند
    return !!this.instructorId() && this.instructorId() === user._id;
  }

  /** آیا کاربر فعلی مدرس این دوره است؟ (برای نمایش برچسب «پاسخ مدرس») */
  isCourseOwnerView(): boolean {
    const user = this.authService.currentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    return !!this.instructorId() && this.instructorId() === user._id;
  }

  togglePinQuestion(d: Discussion): void {
    this.discussionService.moderateDiscussion(d._id, { isPinned: !d.isPinned }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.replaceDiscussion({ ...d, isPinned: !d.isPinned });
          this.toastService.success(res.message || 'به‌روزرسانی شد');
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'خطا در تغییر وضعیت'),
    });
  }

  toggleResolveQuestion(d: Discussion): void {
    this.discussionService.moderateDiscussion(d._id, { isResolved: !d.isResolved }).subscribe({
      next: (res) => {
        if (res?.success) {
          this.replaceDiscussion({ ...d, isResolved: !d.isResolved });
          this.toastService.success(res.message || 'به‌روزرسانی شد');
        }
      },
      error: (err) => this.toastService.error(err?.error?.message || 'خطا در تغییر وضعیت'),
    });
  }

  copyQuestionLink(discussionId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const course = this.course();
    const url = `${window.location.origin}/learn/${course?.slug || course?._id || ''}?lecture=${
      this.currentLecture()?._id || ''
    }#q-${discussionId}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => this.toastService.success('لینک پرسش کپی شد', 'انجام شد'))
      .catch(() => this.toastService.error('کپی لینک ناموفق بود'));
  }

  // ═══════════════════════════════════════════
  // Share / bookmark
  // ═══════════════════════════════════════════
  openShare(): void {
    this.isShareOpen.set(true);
  }

  closeShare(): void {
    this.isShareOpen.set(false);
  }

  shareCourse(): void {
    const course = this.course();
    if (!course || !isPlatformBrowser(this.platformId)) return;

    const url = `${window.location.origin}/course/${course.slug || course._id}`;
    const navAny = navigator as any;

    if (typeof navAny.share === 'function') {
      navAny
        .share({ title: course.title, text: course.shortDescription || course.title, url })
        .catch(() => this.copyToClipboard(url));
    } else {
      this.copyToClipboard(url);
    }
  }

  copyToClipboard(text: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    navigator.clipboard
      ?.writeText(text)
      .then(() => this.toastService.success('لینک دوره کپی شد', 'انجام شد'))
      .catch(() => this.toastService.error('کپی لینک ناموفق بود'));
  }

  toggleBookmark(): void {
    const course = this.course();
    if (!course) return;

    if (!this.authService.isAuthenticated()) {
      this.toastService.info('برای ذخیره در علاقه‌مندی‌ها ابتدا وارد شوید');
      return;
    }
    if (this.isBookmarkBusy()) return;

    this.isBookmarkBusy.set(true);
    this.api.post<any>('/wishlist/toggle', { courseId: course._id }).subscribe({
      next: (res: any) => {
        this.isBookmarkBusy.set(false);
        this.isCourseBookmarked.set(!this.isCourseBookmarked());
        this.toastService.success(res?.message || 'وضعیت علاقه‌مندی تغییر کرد');
      },
      error: (err) => {
        this.isBookmarkBusy.set(false);
        this.toastService.error(err?.error?.message || 'تغییر وضعیت ناموفق بود');
      },
    });
  }

  checkBookmarkState(): void {
    const course = this.course();
    if (!course || !this.authService.isAuthenticated()) return;

    this.api.get<any>('/wishlist').subscribe({
      next: (res: any) => {
        const list = res?.data?.courses || [];
        this.isCourseBookmarked.set(
          list.some((item: any) => item?.course?._id === course._id),
        );
      },
      error: () => undefined,
    });
  }

  toggleFavoriteLecture(lecture: Lecture, event?: Event): void {
    if (event) event.stopPropagation();
    this.favoriteLectureIds.update((s) => {
      const n = new Set(s);
      if (n.has(lecture._id)) n.delete(lecture._id);
      else n.add(lecture._id);
      return n;
    });
  }

  isLectureFavorite(lectureId: string): boolean {
    return this.favoriteLectureIds().has(lectureId);
  }

  // ═══════════════════════════════════════════
  // Instructor
  // ═══════════════════════════════════════════
  contactInstructor(): void {
    const course = this.course();
    const instructorId = this.instructorId();
    if (!course || !instructorId) return;

    if (!this.authService.isAuthenticated()) {
      this.toastService.info('برای ارسال پیام ابتدا وارد حساب کاربری شوید');
      return;
    }

    this.api
      .post<any>('/messages/conversations', { recipientId: instructorId, courseId: course._id })
      .subscribe({
        next: (res: any) => {
          const convId = res?.data?._id;
          if (convId) {
            this.router.navigate(['/messages'], { queryParams: { conversation: convId } });
          } else {
            this.router.navigate(['/messages']);
          }
        },
        error: (err) =>
          this.toastService.error(err?.error?.message || 'شروع گفت‌وگو با مدرس ناموفق بود'),
      });
  }

  // ═══════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════
  getArticleContent(): string {
    const lecture = this.currentLecture();
    const raw = lecture?.articleContent || lecture?.content || '';
    if (!raw) return '';
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['b','i','em','strong','p','br','ul','ol','li','a','h1','h2','h3','h4','h5','h6','blockquote','pre','code','img','table','thead','tbody','tr','th','td','span','div','hr','figure','figcaption','video','source'],
      ALLOWED_ATTR: ['href','target','rel','src','alt','width','height','class','style','controls','allowfullscreen','frameborder'],
    });
  }

  /** Get rich-text content items from current lecture */
  getRichTextContentItems(): any[] {
    const lecture = this.currentLecture();
    if (!lecture?.contentItems?.length) return [];
    return lecture.contentItems.filter((item: any) => item.type === 'rich-text');
  }

  getInstructorBio(): SafeHtml {
    const raw = this.course()?.instructor?.bio || '';
    const clean = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }



  resolveMediaUrl(raw: unknown): string {
    if (raw == null) return '';
    let url = '';
    if (typeof raw === 'string') url = raw.trim();
    else if (typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      url = String(o['url'] ?? o['path'] ?? o['secure_url'] ?? o['src'] ?? '').trim();
    }
    if (!url || url === 'null' || url === 'undefined') return '';
    if (url.startsWith('data:image/')) return url;
    if (url.startsWith('data:')) return '';
    // 🔒 فقط لینک خامِ ویدیو/فایل ممنوع است — تصویر (آواتار/بندانگشتی) عمومی است
    if (this.isRawStorageUrl(url)) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;

    const base = environment.socketUrl
      ? environment.socketUrl.replace(/\/$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin
        : '';
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  getResourceIcon(resource: Resource): string {
    const type = (resource.type || '').toLowerCase();
    const title = (resource.title || '').toLowerCase();
    if (type.includes('pdf') || title.endsWith('.pdf')) return 'picture_as_pdf';
    if (
      type.includes('zip') ||
      type.includes('rar') ||
      title.endsWith('.zip') ||
      title.endsWith('.rar')
    )
      return 'folder_zip';
    if (type.includes('image') || title.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image';
    if (type.includes('video') || title.match(/\.(mp4|webm|mov|avi)$/)) return 'videocam';
    if (type.includes('audio') || title.match(/\.(mp3|wav|ogg|m4a)$/)) return 'audiotrack';
    if (type.includes('word') || title.match(/\.(doc|docx)$/)) return 'description';
    if (type.includes('excel') || title.match(/\.(xls|xlsx|csv)$/)) return 'table_chart';
    if (type.includes('presentation') || title.match(/\.(ppt|pptx)$/)) return 'slideshow';
    if (type.includes('text') || title.endsWith('.txt')) return 'article';
    return 'attach_file';
  }

  getResourceTone(resource: Resource): string {
    const type = (resource.type || '').toLowerCase();
    const title = (resource.title || '').toLowerCase();
    if (type.includes('pdf') || title.endsWith('.pdf')) return 't-pdf';
    if (
      type.includes('zip') ||
      type.includes('rar') ||
      title.endsWith('.zip') ||
      title.endsWith('.rar')
    )
      return 't-zip';
    if (type.includes('figma') || title.endsWith('.fig')) return 't-fig';
    if (type.includes('text') || title.endsWith('.txt') || title.endsWith('.md')) return 't-txt';
    return 't-file';
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  isVideoLecture(): boolean {
    return this.currentLecture()?.type === 'video';
  }

  getLectureTypeLabel(type?: string): string {
    switch (type) {
      case 'video':
        return 'ویدیو';
      case 'article':
        return 'مقاله';
      case 'quiz':
        return 'آزمون';
      case 'download':
        return 'فایل دانلودی';
      case 'assignment':
        return 'تمرین';
      case 'live':
        return 'کلاس زنده';
      default:
        return 'درس';
    }
  }

  getLectureIcon(type?: string): string {
    switch (type) {
      case 'video':
        return 'play_circle';
      case 'article':
        return 'article';
      case 'quiz':
        return 'quiz';
      case 'download':
        return 'download';
      case 'live':
        return 'sensors';
      case 'assignment':
        return 'assignment';
      default:
        return 'play_circle';
    }
  }

  getDownloadFile(): { url: string; name: string; size?: number } | null {
    const lecture = this.currentLecture();
    if (!lecture) return null;

    // 🔒 Check contentItems for attachment type first (new system)
    const attachmentItem = lecture.contentItems?.find((item: any) => item.type === 'attachment' && (item.storage?.key || item.fileUrl));
    if (attachmentItem) {
      return {
        url: `${environment.apiUrl}/upload/file/${lecture._id}?resourceId=${attachmentItem._id}`,
        name: attachmentItem.title || attachmentItem.fileName || 'فایل پیوست',
        size: attachmentItem.fileSize,
      };
    }

    // 🔒 فایل پیوست فقط از مسیر محافظت‌شدهٔ بک‌اند (با بررسی ثبت‌نام)
    if (lecture._id && (lecture.fileName || lecture.fileUrl || lecture.storage?.key)) {
      return {
        url: `${environment.apiUrl}/upload/file/${lecture._id}`,
        name: lecture.fileName || 'فایل پیوست',
        size: lecture.fileSize || lecture.size,
      };
    }
    if (lecture.resources?.length) {
      const r = lecture.resources[0];
      // 🔒 برای منابع هم از اندپوینت محافظت‌شده استفاده می‌کنیم
      return { 
        url: `${environment.apiUrl}/upload/file/${lecture._id}?resourceId=${r._id || r.id}`, 
        name: r.title, 
        size: r.size 
      };
    }
    return null;
  }

  downloadResource(resource: Resource): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    const lecture = this.currentLecture();
    if (!lecture?._id) return;

    // 🔒 استفاده از اندپوینت محافظت‌شده بک‌اند برای دانلود فایل‌ها
    // این اطمینان می‌دهد که بررسی دسترسی (ثبت‌نام/پیش‌نمایش رایگان) انجام می‌شود
    // و لینک مستقیم S3 لو نمی‌رود
    const resourceId = resource._id || resource.id;
    const downloadUrl = `${environment.apiUrl}/upload/file/${lecture._id}${resourceId ? `?resourceId=${resourceId}` : ''}`;
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = resource.title || 'download';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  cancelAutoPlay(): void {
    this.clearAutoPlayTimer();
    this.autoPlayCountdown.set(0);
  }

  private clearAutoPlayTimer(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
      this.autoPlayTimer = null;
    }
  }

  formatDuration(minutes: number): string {
    if (!minutes || minutes === 0) return '۰ دقیقه';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours} ساعت${mins > 0 ? ` و ${mins} دقیقه` : ''}`;
    return `${mins} دقیقه`;
  }

  timeAgo(dateStr?: string): string {
    if (!dateStr) return '';
    const then = new Date(dateStr).getTime();
    if (Number.isNaN(then)) return '';

    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes < 1) return 'همین الان';
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} روز پیش`;
    return new Date(dateStr).toLocaleDateString('fa-IR');
  }

  getInitials(name?: string): string {
    return (name || 'م').trim().charAt(0) || 'م';
  }

  currentUserName(): string {
    return this.authService.currentUser()?.fullName || 'کاربر مهمان';
  }

  // ═══════════════════════════════════════════
  // Navigation out
  // ═══════════════════════════════════════════
  goBack(): void {
    this.router.navigate(['/dashboard/my-courses']);
  }

  goToCoursePage(): void {
    const course = this.course();
    if (!course) return;
    this.router.navigate(['/course', course.slug || course._id]);
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login'], { queryParams: { redirect: this.router.url } });
  }

  trackByLectureId(_: number, l: Lecture): string {
    return l._id;
  }

  trackBySectionId(_: number, s: Section): string {
    return s._id || String(_);
  }

  // ✅ NEW: Helper methods for Content Items (New multi-content system)

  /** Check if lecture has video content items */
  hasVideoContentItem(lecture: Lecture | null): boolean {
    if (!lecture) return false;
    return lecture.contentItems?.some((item: any) => item.type === 'video' && (item.videoUrl || item.storage?.key)) || false;
  }

  getContentItemIcon(type: string): string {
    const icons: Record<string, string> = {
      'video': 'play_circle',
      'rich-text': 'article',
      'attachment': 'insert_drive_file',
      'external-link': 'link',
      'image': 'image',
      'audio': 'audiotrack',
    };
    return icons[type] || 'play_circle';
  }

  getContentItemTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'video': 'ویدیو',
      'rich-text': 'متن غنی',
      'attachment': 'فایل ضمیمه',
      'external-link': 'لینک خارجی',
      'image': 'تصویر',
      'audio': 'فایل صوتی',
    };
    return labels[type] || 'نامشخص';
  }

  /** Get playback URL for a content item video */
  getContentItemPlaybackUrl(item: any): string {
    if (item.videoUrl) return item.videoUrl;
    if (item.storage?.key) {
      const lecture = this.currentLecture();
      if (lecture?._id) {
        return `${environment.apiUrl}/upload/stream/${lecture._id}?resourceId=${item._id}`;
      }
    }
    return '';
  }

  /** Get file URL for a content item attachment - always uses protected backend endpoint */
  getContentItemFileUrl(item: any): string {
    const lecture = this.currentLecture();
    if (!lecture?._id) return '';
    
    // 🔒 همیشه از اندپوینت محافظت‌شده بک‌اند استفاده می‌کنیم تا بررسی دسترسی انجام شود
    // و لینک مستقیم S3 لو نرود (جلوگیری از AccessDenied)
    return `${environment.apiUrl}/upload/file/${lecture._id}?resourceId=${item._id}`;
  }

  /** Get image URL for a content item image - always uses protected backend endpoint */
  getContentItemImageUrl(item: any): string {
    const lecture = this.currentLecture();
    if (!lecture?._id) return '';
    
    // 🔒 همیشه از اندپوینت محافظت‌شده بک‌اند استفاده می‌کنیم تا بررسی دسترسی انجام شود
    // و لینک مستقیم S3 لو نرود (جلوگیری از AccessDenied XML error)
    return `${environment.apiUrl}/upload/file/${lecture._id}?resourceId=${item._id}`;
  }

  /** Get audio URL for a content item audio - always uses protected backend endpoint */
  getContentItemAudioUrl(item: any): string {
    const lecture = this.currentLecture();
    if (!lecture?._id) return '';
    
    // 🔒 همیشه از اندپوینت محافظت‌شده بک‌اند استفاده می‌کنیم تا بررسی دسترسی انجام شود
    // و لینک مستقیم S3 لو نرود (جلوگیری از AccessDenied)
    return `${environment.apiUrl}/upload/file/${lecture._id}?resourceId=${item._id}`;
  }

  /** Play a content item video - opens in lesson preview modal or navigates */
  playContentItemVideo(item: any): void {
    const lecture = this.currentLecture();
    if (!lecture) return;

    // For now, we'll use the existing lesson preview modal mechanism
    // by setting the selected lesson and letting the modal handle it
    this.selectedLesson.set({
      ...lecture,
      _id: lecture._id,
      title: item.title,
      type: 'video',
      videoUrl: this.getContentItemPlaybackUrl(item),
      contentItems: [item]
    } as any);
    this.showLessonModal.set(true);
    this.lockScroll();

    // Load the playback URL for this specific content item
    this.loadLessonPreviewUrl(lecture._id, item._id);
  }

  /** Open image in fullscreen - uses protected backend endpoint */
  openImageFullscreen(imageUrl: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // The imageUrl should already be a protected backend URL from getContentItemImageUrl
    window.open(imageUrl, '_blank', 'noopener,noreferrer');
  }

  // ═══════════════════════════════════════════
  // Image Viewer Methods
  // ═══════════════════════════════════════════

  /** Open image viewer with all images from current lecture */
  openImageViewer(contentItem: any, index: number): void {
    const lecture = this.currentLecture();
    if (!lecture || !lecture.contentItems?.length) return;

    // Filter only image type content items
    const images = lecture.contentItems
      .filter((item: any) => item.type === 'image')
      .map((item: any, i: number) => ({
        id: item._id,
        url: this.getContentItemImageUrl(item),
        title: item.title,
        description: item.description,
        order: item.order ?? i,
      }))
      .sort((a: any, b: any) => a.order - b.order);

    if (images.length === 0) return;

    // Find the index of the clicked image in the filtered array
    const clickedImageIndex = images.findIndex((img: any) => img.id === contentItem._id);

    this.imageViewerImages.set(images);
    this.imageViewerInitialIndex.set(clickedImageIndex >= 0 ? clickedImageIndex : 0);
    this.showImageViewer.set(true);
    this.lockScroll();
  }

  /** Close image viewer */
  closeImageViewer(): void {
    this.showImageViewer.set(false);
    this.unlockScroll();
    this.imageViewerImages.set([]);
    this.imageViewerInitialIndex.set(0);
  }

  // ═══════════════════════════════════════════
  // Lesson Preview Modal Helpers
  // ═══════════════════════════════════════════

  private lockScroll(): void {
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }

  private loadLessonPreviewUrl(lectureId: string, resourceId?: string): void {
    this.isLoadingLessonPreview.set(true);
    this.lessonPreviewError.set('');

    this.videoUploadService.getPlaybackUrl(lectureId, resourceId).subscribe({
      next: (res: any) => {
        const url = res?.data?.url || res?.url || '';
        if (url && url !== 'null' && url !== 'undefined') {
          this.lessonPreviewVideoUrl.set(url);
          this.startLessonPreviewRefreshTimer(lectureId, resourceId);
        } else {
          console.warn('[Classroom] No playback URL returned from backend for lecture:', lectureId);
          this.lessonPreviewError.set('لینک ویدیو در دسترس نیست.');
        }
        this.isLoadingLessonPreview.set(false);
      },
      error: (err) => {
        console.warn('[Classroom] Preview URL error:', err);
        this.lessonPreviewError.set(err?.error?.message || 'خطا در بارگذاری ویدیو.');
        this.isLoadingLessonPreview.set(false);
      },
    });
  }

  private startLessonPreviewRefreshTimer(lectureId: string, resourceId?: string): void {
    this.clearLessonPreviewTimer();
    if (!isPlatformBrowser(this.platformId)) return;

    this.lessonPreviewRefreshTimer = setInterval(() => {
      if (this.showLessonModal()) {
        this.refreshLessonPreviewUrl(lectureId, resourceId);
      } else {
        this.clearLessonPreviewTimer();
      }
    }, this.LESSON_PREVIEW_REFRESH_INTERVAL);
  }

  private refreshLessonPreviewUrl(lectureId: string, resourceId?: string): void {
    this.videoUploadService.refreshPlaybackUrl(lectureId, resourceId).subscribe({
      next: (res: any) => {
        const url = res?.data?.url || res?.url || '';
        if (url && url !== 'null' && url !== 'undefined') {
          this.lessonPreviewVideoUrl.set(url);
        }
      },
      error: (err) => {
        console.warn('[Classroom] Refresh failed:', err);
      },
    });
  }

  private clearLessonPreviewTimer(): void {
    if (this.lessonPreviewRefreshTimer) {
      clearInterval(this.lessonPreviewRefreshTimer);
      this.lessonPreviewRefreshTimer = null;
    }
  }

  onLessonPreviewUrlExpired(): void {
    const lesson = this.selectedLesson();
    if (!lesson || !lesson._id) return;
    // Find the video content item if exists
    const videoItem = lesson.contentItems?.find((item: any) => item.type === 'video' && (item.storage?.key || item.videoUrl));
    this.refreshLessonPreviewUrl(lesson._id, videoItem?._id);
  }

  closeLessonModal(): void {
    this.showLessonModal.set(false);
    this.selectedLesson.set(null);
    this.lessonPreviewVideoUrl.set('');
    this.lessonPreviewError.set('');
    this.isLoadingLessonPreview.set(false);
    this.clearLessonPreviewTimer();
    this.unlockScroll();
  }

  // ═══════════════════════════════════════════
  // Lesson Preview Modal Helpers (copied from DetailComponent)
  // ═══════════════════════════════════════════

  /** ۱. استخراج خام آدرس بدون صدا زدن هیچ توابعی */
  private getRawLessonUrl(lesson: any): string {
    if (!lesson) return '';
    return String(
      lesson.videoUrl || lesson.fileUrl || lesson.url || lesson.filePath || lesson.contentUrl || ''
    ).trim();
  }

  /** ۲. تشخیص نوع فایل صرفاً از روی فیلدهای درس و URL خام */
  getLessonFileType(lesson: any): 'video' | 'embed' | 'pdf' | 'image' | 'audio' | 'file' {
    if (!lesson) return 'file';

    const explicitType = String(lesson.type || '').toLowerCase();
    if (explicitType === 'video') return 'video';
    if (explicitType === 'pdf') return 'pdf';
    if (explicitType === 'image') return 'image';
    if (explicitType === 'audio') return 'audio';
    if (explicitType === 'embed') return 'embed';

    const rawUrl = this.getRawLessonUrl(lesson).toLowerCase();
    if (!rawUrl) return 'file';

    if (rawUrl.includes('youtube') || rawUrl.includes('youtu.be') || rawUrl.includes('aparat'))
      return 'embed';
    if (
      rawUrl.endsWith('.mp4') ||
      rawUrl.endsWith('.webm') ||
      rawUrl.endsWith('.mkv') ||
      rawUrl.includes('.m3u8')
    )
      return 'video';
    if (rawUrl.endsWith('.pdf')) return 'pdf';
    if (
      rawUrl.endsWith('.png') ||
      rawUrl.endsWith('.jpg') ||
      rawUrl.endsWith('.jpeg') ||
      rawUrl.endsWith('.webp')
    )
      return 'image';
    if (rawUrl.endsWith('.mp3') || rawUrl.endsWith('.wav')) return 'audio';

    return 'file';
  }

  /** ۳. دریافت آدرس نهایی رسانه جهت نمایش/دانلود */
  getLessonMediaUrl(lesson: any): string | null {
    if (!lesson) return null;

    const fileType = this.getLessonFileType(lesson);

    // 🔒 همهٔ فایل‌های آپلودی فقط از طریق اندپوینت
    // محافظت‌شدهٔ بک‌اند در دسترس هستند تا لینک خام ذخیره‌سازی لو نرود.
    if (lesson._id) {
      if (fileType === 'video' || fileType === 'audio') {
        // ویدیو/صوت باید از /upload/stream با توکن استفاده کنند
        return `${environment.apiUrl}/upload/stream/${lesson._id}`;
      }
      if (fileType === 'pdf' || fileType === 'image' || fileType === 'file') {
        // اسناد/تصاویر/فایل‌ها از /upload/file استفاده می‌کنند
        return `${environment.apiUrl}/upload/file/${lesson._id}`;
      }
    }

    // فقط embed عمومی (YouTube/Aparat/Vimeo) و لینک‌های غیرآپلودی مجاز به استفاده مستقیم هستند
    const rawUrl = this.getRawLessonUrl(lesson);
    if (!rawUrl) return null;
    if (fileType === 'video' || fileType === 'embed') {
      // 🔒 اگر لینک خام ذخیره‌سازی است، نباید مستقیم استفاده شود
      if (this.isRawStorageUrl(rawUrl)) {
        return lesson._id ? `${environment.apiUrl}/upload/stream/${lesson._id}` : null;
      }
      return this.resolveMediaUrl(rawUrl);
    }
    return this.resolveMediaUrl(rawUrl);
  }

  /**
   * بررسی می‌کند که آیا URL داده‌شده یک لینک خام ذخیره‌سازی (S3/Spaces/GCS/Azure/R2/Arvan/Liara/MinIO) است یا خیر.
   * برای جلوگیری از لو رفتن لینک‌های مستقیم ذخیره‌سازی استفاده می‌شود.
   */
  isRawStorageUrl(rawUrl: string): boolean {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      return isRawMediaUrl(rawUrl);
    } catch {
      // Fallback: شناسایی الگوهای رایج ذخیره‌سازی ابری
      const url = rawUrl.toLowerCase();
      return (
        url.includes('.s3.') ||
        url.includes('.s3-') ||
        url.includes('amazonaws.com') ||
        url.includes('digitaloceanspaces.com') ||
        url.includes('storage.googleapis.com') ||
        url.includes('blob.core.windows.net') ||
        url.includes('r2.cloudflarestorage.com') ||
        url.includes('arvanstorage.') ||
        url.includes('liara.space') ||
        url.includes('.minio.')
      );
    }
  }

  getSafeLessonEmbedUrl(lesson: any): SafeResourceUrl | null {
    const url = this.getLessonMediaUrl(lesson);
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch)
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`,
      );
    const apMatch = url.match(/aparat\.com\/v\/([a-zA-Z0-9_-]+)/);
    if (apMatch)
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.aparat.com/video/video/embed/videohash/${apMatch[1]}/vt/frame?autoplay=1`,
      );
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}