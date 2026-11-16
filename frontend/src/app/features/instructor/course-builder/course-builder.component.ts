import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  HostListener,
  ElementRef,
  ViewChild,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  FormControl,
} from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  CdkDragDrop,
  moveItemInArray,
  CdkDrag,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { ApiService } from '../../../core/services/api.service';
import { CourseService } from '../../../core/services/course.service';
import {
  VideoUploadService,
  UploadProgressEvent,
} from '../../../core/services/video-upload.service';
import { SectionService } from '../../../core/services/section.service';
import { LectureService } from '../../../core/services/lecture.service';
import { environment } from '../../../../environments/environment.development';
import { firstValueFrom, Observable, timeout } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { LearningPathService } from '../../../services/learning-path.service';
import {
  LearningPathSummary,
  LearningPathDetailForAssignment,
  CourseInPathSettings,
} from '../../../core/models/course.model';

// Angular Material Datepicker Imports
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { provideDateFnsAdapter } from 'ngx-material-date-fns-adapter';
import { faIR } from 'date-fns/locale';

import {
  trigger,
  transition,
  style,
  animate,
  stagger,
  query,
  state,
} from '@angular/animations';

// ⭐ Validator های اختصاصی برای محاسبه متن خالص (بدون تگ HTML) در ادیتور
export function richTextMinLength(min: number) {
  return (control: AbstractControl) => {
    if (!control.value) return null;
    const text = control.value.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
    return text.length >= min
      ? null
      : { minlength: { requiredLength: min, actualLength: text.length } };
  };
}

export function richTextMaxLength(max: number) {
  return (control: AbstractControl) => {
    if (!control.value) return null;
    const text = control.value.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
    return text.length <= max
      ? null
      : { maxlength: { requiredLength: max, actualLength: text.length } };
  };
}

interface Step {
  id: number;
  title: string;
  icon: string;
  description: string;
  isValid?: boolean;
}

@Component({
  selector: 'app-course-builder',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CdkDropList,
    CdkDrag,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    RichTextEditorComponent,
    SanitizeHtmlPipe,
    MarkdownPipe,
  ],
  providers: [
    provideDateFnsAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: faIR },
  ],
  templateUrl: './course-builder.component.html',
  styleUrl: './course-builder.component.scss',
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate(
          '400ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'translateY(-20px)' })
        ),
      ]),
    ]),
    trigger('listAnimation', [
      transition('* => *', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateX(20px)' }),
            stagger(
              60,
              animate(
                '300ms ease-out',
                style({ opacity: 1, transform: 'translateX(0)' })
              )
            ),
          ],
          { optional: true }
        ),
      ]),
    ]),
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(-50%) scale(0.95)' }),
        animate(
          '300ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateX(-50%) scale(1)' })
        ),
      ]),
      transition(':leave', [
        animate(
          '200ms ease-in',
          style({ opacity: 0, transform: 'translateX(-50%) scale(0.95)' })
        ),
      ]),
    ]),
    trigger('expandCollapse', [
      state(
        'collapsed',
        style({ height: '0', opacity: 0, overflow: 'hidden' })
      ),
      state('expanded', style({ height: '*', opacity: 1 })),
      transition(
        'collapsed <=> expanded',
        animate('300ms cubic-bezier(0.4, 0, 0.2, 1)')
      ),
    ]),
  ],
})
export class CourseBuilderComponent implements OnInit, OnDestroy {
  @ViewChild('thumbnailInput') thumbnailInput!: ElementRef<HTMLInputElement>;
  @ViewChild('promoVideoInput') promoVideoInput!: ElementRef<HTMLInputElement>;

  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private courseService = inject(CourseService);
  private videoUploadService = inject(VideoUploadService);
  private sectionService = inject(SectionService);
  private lectureService = inject(LectureService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);
  private authService = inject(AuthService);
  private lpService = inject(LearningPathService);

  isBrowser = signal<boolean>(false);

  courseId = signal<string | null>(null);
  isEditMode = false;
  courseStatus = signal<string>('draft');
  rejectionReason = signal<string | null>(null);
  currentStep = signal(1);
  isSaving = signal(false);
  isAutoSaving = signal(false);
  lastSaved = signal<Date | null>(null);
  successMessage = signal('');
  errorMessage = signal('');

  // Auto-save with localStorage backup
  private autosaveInterval: any;
  private draftKey: string | null = null;
  private hydratingCourse = false;
  private restoredDraft = false;
  private readonly AUTOSAVE_DEBOUNCE_MS = 500;
  private autosaveDebounceTimer: any;
  hasUnsavedChanges = signal(false);
  showRecoveryBanner = signal(false);

  subcategories = signal<any[]>([]);
  isLoadingSubcategories = signal<boolean>(false);
  isUploadingThumbnail = signal<boolean>(false);
  isUploadingVideo = signal<boolean>(false);
  thumbnailUploadProgress = signal<number>(0);
  promoUploadProgress = signal<number>(0);

  lectureUploadProgress = signal<Record<string, number>>({});
  lectureUploadStatus = signal<
    Record<string, 'idle' | 'uploading' | 'success' | 'error'>
  >({});

  formTick = signal(0);

  thumbnailPreview = signal<string | null>(null);
  promoVideoPreview = signal<string | null>(null);

  collapsedSections = signal<Set<number>>(new Set());
  tagInput = signal('');
  reqInput = signal('');
  showReqDropdown = signal(false);
  allCourses = signal<any[]>([]);
  filteredReqCourses = signal<any[]>([]);
  showPreviewModal = signal(false);

  // ═══════════════════════════════════════════
  // ✅ NEW: انتساب دوره به مسیر یادگیری (فقط ادمین)
  // ═══════════════════════════════════════════
  learningPathMode = signal<'none' | 'existing' | 'new'>('none');
  pathSearchQuery = signal('');
  pathSearchResults = signal<LearningPathSummary[]>([]);
  pathSearchLoading = signal(false);
  selectedPath = signal<LearningPathDetailForAssignment | null>(null);
  selectedStageId = signal<string | null>(null);
  newPathTitle = signal('');
  newPathSubtitle = signal('');
  newPathIcon = signal('📚');
  newPathDifficulty = signal('beginner');
  newPathShortDesc = signal('');
  newPathDesc = signal('');
  newFirstStageTitle = signal('');
  newFirstStageDesc = signal('');
  newFirstStageIcon = signal('📚');
  newFirstStageColor = signal('#a435f0');
  pathAssignmentLoading = signal(false);
  existingPathCourses = signal<any[]>([]); // دوره‌های موجود در مسیر انتخاب‌شده
  courseInPathSettings = signal<CourseInPathSettings>({
    isRequired: true,
    order: null,
    customTitle: '',
    customDescription: '',
    estimatedDuration: null,
    prerequisites: [],
  });

  basicForm!: FormGroup;
  mediaForm!: FormGroup;
  curriculumForm!: FormGroup;
  pricingForm!: FormGroup;
  seoForm!: FormGroup;

  categories = signal<any[]>([]);

  progressRadius = 52;
  progressCircumference = 2 * Math.PI * 52;

  statusLabel = computed(() => {
    const map: Record<string, string> = {
      draft: 'پیش‌نویس',
      pending: 'در انتظار بررسی',
      published: 'منتشر شده',
      rejected: 'رد شده',
      approved: 'تأیید شده',
    };
    return map[this.courseStatus()] || 'پیش‌نویس';
  });

  // وضعیت رایگان بودن دوره (واکنشی)
  isFreeCourse = computed(() => {
    this.formTick();
    if (!this.pricingForm) return false;
    return Boolean(this.pricingForm.get('isFree')?.value);
  });

  // ⭐ تابع پاکسازی تگ‌های HTML برای شمارشگرها
  stripHtml(html: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
  }

  // ⭐ سیگنال‌های زنده برای شمارش دقیق کاراکترها
  titleLength = computed(() => {
    this.formTick();
    if (!this.basicForm) return 0;
    return (this.basicForm.get('title')?.value || '').trim().length;
  });

  shortDescLength = computed(() => {
    this.formTick();
    if (!this.basicForm) return 0;
    return this.stripHtml(this.basicForm.get('shortDescription')?.value).length;
  });

  descLength = computed(() => {
    this.formTick();
    if (!this.basicForm) return 0;
    return this.stripHtml(this.basicForm.get('description')?.value).length;
  });

  basicProgress = computed(() => {
    this.formTick();
    if (!this.basicForm) return 0;
    const controls = ['title', 'description', 'category', 'shortDescription'];
    const filled = controls.filter((c) => {
      const val = this.basicForm.get(c)?.value;
      return val && String(val).trim().length > 0;
    }).length;
    return Math.round((filled / controls.length) * 100);
  });

  mediaProgress = computed(() => {
    this.formTick();
    if (!this.mediaForm) return 0;
    let progress = 0;
    if (this.thumbnailPreview()) progress += 50;
    const promoVal = this.mediaForm.get('promoVideoUrl')?.value;
    if (this.promoVideoPreview() || (promoVal && promoVal.trim().length > 0))
      progress += 50;
    return progress;
  });

  curriculumProgress = computed(() => {
    this.formTick();
    if (!this.sections || this.sections.length === 0) return 0;

    let totalScore = 0;
    let maxScore = 0;

    for (const section of this.sections.controls) {
      maxScore += 1;
      if (section.get('title')?.value?.trim()) totalScore += 1;

      const lecturesControl = section.get('lectures');
      const controls =
        lecturesControl instanceof FormArray ? lecturesControl.controls : [];

      if (!controls || controls.length === 0) continue;

      for (const lecture of controls) {
        maxScore += 2;
        if (lecture.get('title')?.value?.trim()) totalScore += 1;
        const type = lecture.get('type')?.value;
        const hasContent =
          (type === 'video' && lecture.get('videoUrl')?.value) ||
          (type === 'article' && lecture.get('content')?.value?.trim()) ||
          (type === 'download' && lecture.get('fileUrl')?.value) ||
          type === 'quiz' ||
          type === 'assignment' ||
          type === 'live';
        if (hasContent) totalScore += 1;
      }
    }

    if (maxScore === 0) return 0;
    return Math.round((totalScore / maxScore) * 100);
  });

  pricingProgress = computed(() => {
    this.formTick();
    if (!this.pricingForm?.valid) return 0;
    return 100;
  });

  seoProgress = computed(() => {
    this.formTick();
    if (!this.seoForm) return 0;
    const controls = ['slug', 'metaTitle', 'metaDescription'];
    const filled = controls.filter((c) => {
      const val = this.seoForm.get(c)?.value;
      return val && String(val).trim().length > 0;
    }).length;
    return Math.round((filled / controls.length) * 100);
  });

  overallProgress = computed(() =>
    Math.round(
      this.basicProgress() * 0.3 +
        this.mediaProgress() * 0.2 +
        this.curriculumProgress() * 0.3 +
        this.pricingProgress() * 0.15 +
        this.seoProgress() * 0.05
    )
  );

  totalLectures = computed(() => {
    this.formTick();
    if (!this.sections) return 0;
    return this.sections.controls.reduce((acc, s) => {
      const lecturesControl = s.get('lectures');
      const controls =
        lecturesControl instanceof FormArray ? lecturesControl.controls : [];
      return acc + controls.length;
    }, 0);
  });

  totalDuration = computed(() => {
    this.formTick();
    if (!this.sections) return 0;
    return this.sections.controls.reduce((acc, s) => {
      const lecturesControl = s.get('lectures');
      const controls =
        lecturesControl instanceof FormArray ? lecturesControl.controls : [];
      const secDuration = controls.reduce((sum, l) => {
        // First check content items for duration
        const contentItemsControl = l.get('contentItems');
        const contentItemsArray = contentItemsControl instanceof FormArray ? contentItemsControl.controls : [];
        
        if (contentItemsArray.length > 0) {
          // Sum duration from content items (video + audio)
          const ciDuration = contentItemsArray.reduce((ciSum, ci) => 
            ciSum + (Number(ci.get('videoDuration')?.value) || 0) + (Number(ci.get('audioDuration')?.value) || 0), 0);
          return sum + ciDuration;
        }
        
        // Fallback to legacy lecture duration
        return sum + (Number(l.get('duration')?.value) || 0);
      }, 0);
      return acc + secDuration;
    }, 0);
  });

  steps: Step[] = [
    { id: 1, title: 'اطلاعات پایه', icon: 'info', description: 'مشخصات کلی دوره' },
    { id: 2, title: 'رسانه‌ها', icon: 'perm_media', description: 'کاور و ویدیو معرفی' },
    { id: 3, title: 'قیمت‌گذاری', icon: 'sell', description: 'مالی و نوع دسترسی' },
    { id: 4, title: 'سرفصل‌ها', icon: 'menu_book', description: 'محتوای آموزشی' },
    { id: 5, title: 'سئو و انتشار', icon: 'rocket_launch', description: 'انتشار نهایی' },
  ];

  // Content item types for the new multi-content lecture system
  contentTypes: ('video' | 'rich-text' | 'attachment' | 'external-link' | 'image' | 'audio')[] = [
    'video', 'rich-text', 'attachment', 'external-link', 'image', 'audio'
  ];

  /** Test external link in new tab */
  testExternalLink(url: string): void {
    if (url && url.trim()) {
      window.open(url.trim(), '_blank', 'noopener,noreferrer');
    }
  }

  ngOnInit(): void {
    this.isBrowser.set(isPlatformBrowser(this.platformId));

    this.initForms();

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.courseId.set(id);
      this.isEditMode = true;
      this.hydratingCourse = true;
    }
    // Separate drafts by authenticated user and editor route, never share across accounts.
    const userId = this.authService.currentUser()?._id;
    this.draftKey = userId ? `course_builder_draft:${userId}:${id || 'new'}` : null;

    // بارگذاری دوره‌های منتشر شده برای لیست پیش‌نیازها
    this.loadAllCourses();

    if (this.isBrowser()) {
      this.setupAutosave();
    }

    if (this.courseService.categories().length === 0) {
      this.courseService.getParentCategories().subscribe({
        next: (res) => {
          if (res.success && res.data) {
            const rootCategories = res.data.filter(
              (cat: any) =>
                cat.level === 0 &&
                (cat.parent === null || cat.parent === undefined)
            );
            this.categories.set(rootCategories);
          }
        },
      });
    } else {
      const allCats = this.courseService.categories();
      this.categories.set(
        allCats.filter(
          (cat: any) =>
            cat.level === 0 && (cat.parent === null || cat.parent === undefined)
        )
      );
    }

    if (id) this.loadCourse(id);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.isBrowser()) return;

    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveDraft();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowRight') {
      event.preventDefault();
      this.prevStep();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowLeft') {
      event.preventDefault();
      this.nextStep();
    }
  }

  private setupAutosave(): void {
    if (!this.isBrowser()) return;

    // Check for existing draft on load
    this.checkForDraftRecovery();

    const forms = [this.basicForm, this.mediaForm, this.curriculumForm, this.pricingForm, this.seoForm];
    forms.forEach(form => form.valueChanges.subscribe(() => {
      if (this.hydratingCourse || this.showRecoveryBanner()) return;
      this.hasUnsavedChanges.set(true);
      clearTimeout(this.autosaveDebounceTimer);
      this.autosaveDebounceTimer = setTimeout(() => this.saveDraftToLocalStorage(), this.AUTOSAVE_DEBOUNCE_MS);
    }));

    // Periodic server auto-save (only in edit mode)
    this.autosaveInterval = setInterval(() => {
      if (
        this.hasUnsavedChanges() &&
        !this.showRecoveryBanner() &&
        !this.isSaving() && !this.isAutoSaving() &&
        this.basicForm?.valid &&
        this.basicForm.get('title')?.value?.trim() &&
        this.isEditMode &&
        this.courseId()
      ) {
        this.autoSave();
      }
    }, 30000);
  }

  @HostListener('window:pagehide')
  persistDraftOnPageHide(): void {
    if (this.hasUnsavedChanges() && !this.showRecoveryBanner()) this.saveDraftToLocalStorage();
  }

  ngOnDestroy(): void {
    this.persistDraftOnPageHide();
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }
    if (this.autosaveDebounceTimer) {
      clearTimeout(this.autosaveDebounceTimer);
    }
  }

  private autoSave(): void {
    if (!this.isEditMode || !this.courseId() || this.isSaving() || this.isAutoSaving()) return;
    this.saveDraftToLocalStorage();
    const snapshot = this.draftSnapshot();
    this.isAutoSaving.set(true);
    const payload = this.assemblePayload();

    this.api.put<any>(`/courses/${this.courseId()}`, payload).pipe(timeout(30000)).subscribe({
      next: async () => {
        try {
          await this.syncSectionsAndLectures(this.courseId()!);
          this.lastSaved.set(new Date());
          this.markSavedIfUnchanged(snapshot);
        } catch (e) {
          console.warn('Auto-save section sync failed:', e);
          this.showToast('ذخیره خودکار کامل نشد؛ نسخه محلی حفظ شد.', 'error');
        } finally {
          this.isAutoSaving.set(false);
        }
      },
      error: () => this.isAutoSaving.set(false),
    });
  }

  // LocalStorage draft management
  private saveDraftToLocalStorage(): void {
    if (!this.isBrowser() || !this.draftKey) return;

    try {
      const draft = {
        basicForm: this.basicForm?.getRawValue(),
        mediaForm: this.mediaForm?.getRawValue(),
        curriculumForm: this.curriculumForm?.getRawValue(),
        pricingForm: this.pricingForm?.getRawValue(),
        seoForm: this.seoForm?.getRawValue(),
        courseId: this.courseId(),
        isEditMode: this.isEditMode,
        timestamp: Date.now(),
      };
      localStorage.setItem(this.draftKey, JSON.stringify(draft));
      this.hasUnsavedChanges.set(true);
    } catch (e) {
      console.warn('Failed to save draft to localStorage:', e);
    }
  }

  private checkForDraftRecovery(): void {
    if (!this.isBrowser() || !this.draftKey) return;

    try {
      const saved = localStorage.getItem(this.draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        // Only show recovery if draft is recent (within 24 hours) and has content
        const isRecent = Date.now() - draft.timestamp < 24 * 60 * 60 * 1000;
        const hasContent = !!draft.basicForm || !!draft.curriculumForm;
        
        if (isRecent && hasContent && (!this.isEditMode || draft.courseId === this.courseId())) {
          this.showRecoveryBanner.set(true);
        }
      }
    } catch (e) {
      console.warn('Failed to check for draft recovery:', e);
    }
  }

  recoverDraft(): void {
    if (!this.isBrowser() || !this.draftKey) return;

    try {
      const saved = localStorage.getItem(this.draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        
        this.restoredDraft = true;
        // FormArray.patchValue does not create missing controls: rebuild every nested array first.
        const restoreArray = (array: FormArray, values: any[]) => {
          array.clear({ emitEvent: false });
          (values || []).forEach(value => array.push(this.fb.control(value), { emitEvent: false }));
        };
        for (const name of ['tags', 'requirements', 'learningOutcomes', 'targetAudience']) {
          restoreArray(this.basicForm.get(name) as FormArray, draft.basicForm?.[name]);
        }
        restoreArray(this.keywords, draft.seoForm?.keywords);
        this.sections.clear({ emitEvent: false });
        for (const section of draft.curriculumForm?.sections || []) {
          const lectures = this.fb.array<FormGroup>([]);
          for (const lecture of section.lectures || []) {
            const items = this.fb.array<FormGroup>([]);
            for (const item of lecture.contentItems || []) {
              const controls: Record<string, any> = {};
              for (const [key, value] of Object.entries(item)) controls[key] = [value];
              items.push(this.fb.group(controls), { emitEvent: false });
            }
            const controls: Record<string, any> = {};
            for (const [key, value] of Object.entries(lecture)) {
              if (key !== 'contentItems') controls[key] = [value];
            }
            controls['contentItems'] = items;
            lectures.push(this.fb.group(controls), { emitEvent: false });
          }
          this.sections.push(this.fb.group({
            title: [section.title || '', Validators.required],
            description: [section.description || ''],
            lectures,
          }), { emitEvent: false });
        }
        if (draft.basicForm) this.basicForm.patchValue(draft.basicForm, { emitEvent: false });
        if (draft.mediaForm) this.mediaForm.patchValue(draft.mediaForm, { emitEvent: false });
        if (draft.pricingForm) this.pricingForm.patchValue(draft.pricingForm, { emitEvent: false });
        if (draft.seoForm) this.seoForm.patchValue(draft.seoForm, { emitEvent: false });
        if (!this.isEditMode && draft.courseId) {
          this.courseId.set(draft.courseId);
          this.isEditMode = true;
        }
        this.thumbnailPreview.set(draft.mediaForm?.thumbnailUrl || '');
        this.promoVideoPreview.set(draft.mediaForm?.promoVideoUrl || '');
        if (draft.basicForm?.category) this.onCategoryChange(draft.basicForm.category);
        this.hasUnsavedChanges.set(true);
        this.triggerFormTick();
        this.showRecoveryBanner.set(false);
        this.showToast('پیش‌نویس بازیابی شد ✅', 'success');
      }
    } catch (e) {
      console.error('Failed to recover draft:', e);
      this.showToast('خطا در بازیابی پیش‌نویس', 'error');
    }
  }

  dismissRecovery(): void {
    this.showRecoveryBanner.set(false);
    this.clearLocalStorageDraft();
  }

  private clearLocalStorageDraft(): void {
    if (!this.isBrowser()) return;
    if (this.draftKey) localStorage.removeItem(this.draftKey);
    this.hasUnsavedChanges.set(false);
  }

  private draftSnapshot(): string {
    return JSON.stringify([this.basicForm.getRawValue(), this.mediaForm.getRawValue(),
      this.curriculumForm.getRawValue(), this.pricingForm.getRawValue(), this.seoForm.getRawValue()]);
  }

  private markSavedIfUnchanged(snapshot: string): void {
    if (snapshot !== this.draftSnapshot()) {
      this.saveDraftToLocalStorage();
      return;
    }
    clearTimeout(this.autosaveDebounceTimer);
    for (const form of [this.basicForm, this.mediaForm, this.curriculumForm, this.pricingForm, this.seoForm]) {
      form.markAsPristine();
    }
    this.clearLocalStorageDraft();
  }

  initForms(): void {
    this.basicForm = this.fb.group({
      title: [
        '',
        [
          Validators.required,
          Validators.minLength(10),
          Validators.maxLength(150),
        ],
      ],
      subtitle: ['', Validators.maxLength(200)],
      // ⭐ استفاده از Validator های جدید برای ادیتور
      description: ['', [Validators.required, richTextMinLength(100)]],
      shortDescription: ['', [Validators.required, richTextMaxLength(300)]],
      category: ['', Validators.required],
      subcategory: [{ value: '', disabled: true }],
      level: ['all-levels'],
      language: ['fa'],
      tags: this.fb.array([]),
      requirements: this.fb.array([]),
      learningOutcomes: this.fb.array([]),
      targetAudience: this.fb.array([]),
    });

    this.mediaForm = this.fb.group({
      thumbnailUrl: [''],
      promoVideoUrl: [''],
      promoVideoType: ['upload'],
    });

    this.curriculumForm = this.fb.group({
      sections: this.fb.array([]),
    });

    this.pricingForm = this.fb.group({
      price: [0, [Validators.required, Validators.min(0)]],
      discountPrice: [null],
      discountEndDate: [null],
      discountType: ['none'],
      cdStartDate: [null],
      cdStartTime: ['00:00'],
      cdEndDate: [null],
      cdEndTime: ['23:59'],
      cdInitialPercent: [100, [Validators.min(0), Validators.max(100)]],
      cdFinalPercent: [0, [Validators.min(0), Validators.max(100)]],
      cdMode: ['linear'],
      cdStepPercent: [10, [Validators.min(1), Validators.max(100)]],
      cdStepInterval: [30, [Validators.min(1)]],
      isFree: [false],
      hasCertificate: [true],
      hasLifetimeAccess: [true],
      hasSupport: [false],
      maxStudents: [null],
      installmentEnabled: [false],
      installmentCount: [3],
    });

    this.seoForm = this.fb.group({
      metaTitle: ['', Validators.maxLength(60)],
      metaDescription: ['', Validators.maxLength(200)],
      slug: [''],
      keywords: this.fb.array([]),
      status: ['draft'],
    });

    this.basicForm.valueChanges.subscribe(() => this.triggerFormTick());
    this.mediaForm.valueChanges.subscribe(() => this.triggerFormTick());
    this.curriculumForm.valueChanges.subscribe(() => this.triggerFormTick());
    this.pricingForm.valueChanges.subscribe(() => this.triggerFormTick());

    this.pricingForm.get('isFree')?.valueChanges.subscribe((val: boolean) => {
      if (val) {
        this.pricingForm.patchValue(
          {
            price: 0,
            discountPrice: null,
            discountEndDate: null,
            discountType: 'none',
            installmentEnabled: false,
            maxStudents: null,
          },
          { emitEvent: false }
        );
        this.unlockAllLectures();
      }
      this.triggerFormTick();
    });

    this.basicForm.get('category')?.valueChanges.subscribe((categoryId) => {
      this.onCategoryChange(categoryId);
    });

    this.basicForm.get('title')?.valueChanges.subscribe((title) => {
      if (title && !this.seoForm.get('slug')?.dirty) {
        this.seoForm.patchValue(
          {
            slug: this.generateSlug(title),
            metaTitle: title.substring(0, 60),
          },
          { emitEvent: false }
        );
      }
    });
  }

  /** بارگذاری تمام دوره‌های منتشر شده برای لیست پیش‌نیاز */
  loadAllCourses(): void {
    this.api.get<any>('/courses', { limit: 500, status: 'published' }).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          // حذف دوره فعلی از لیست (اگر در حال ویرایش باشیم)
          const currentId = this.courseId();
          const courses = currentId
            ? res.data.filter((c: any) => c._id !== currentId)
            : res.data;
          this.allCourses.set(courses);
        }
      },
      error: () => {},
    });
  }

  /** فیلتر دوره‌ها بر اساس متن جستجو */
  filterReqCourses(query: string): void {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.filteredReqCourses.set([]);
      this.showReqDropdown.set(false);
      return;
    }
    const existingTitles = this.requirements.value.map((r: string) => r.toLowerCase());
    const results = this.allCourses().filter(
      (c: any) =>
        !existingTitles.includes(c.title.toLowerCase()) &&
        (c.title.toLowerCase().includes(q) ||
          (c.tags || []).some((t: string) => t.toLowerCase().includes(q)))
    );
    this.filteredReqCourses.set(results.slice(0, 8));
    this.showReqDropdown.set(results.length > 0);
  }

  /** انتخاب یک دوره به‌عنوان پیش‌نیاز */
  selectReqCourse(course: any): void {
    if (this.requirements.length >= 10) return;
    // اضافه کردن عنوان دوره به لیست پیش‌نیازها
    this.requirements.push(this.fb.control(course.title));
    this.reqInput.set('');
    this.showReqDropdown.set(false);
    this.filteredReqCourses.set([]);
    this.triggerFormTick();
  }

  /** بستن dropdown با کلیک بیرون */
  onReqInputBlur(): void {
    // تاخیر کوتاه تا کلیک روی آیتم dropdown فرصت داشته باشد اجرا شود
    setTimeout(() => this.showReqDropdown.set(false), 200);
  }

  unlockAllLectures(): void {
    if (!this.sections) return;
    for (let i = 0; i < this.sections.length; i++) {
      const lectures = this.getLectures(i);
      lectures.controls.forEach((lec) => {
        lec.get('isFreePreview')?.setValue(true, { emitEvent: false });
      });
    }
    this.triggerFormTick();
  }

  onCategoryChange(categoryId: string): void {
    const subcatControl = this.basicForm.get('subcategory');

    if (!categoryId) {
      this.subcategories.set([]);
      subcatControl?.patchValue('');
      subcatControl?.disable();
      return;
    }

    this.isLoadingSubcategories.set(true);
    subcatControl?.disable();

    if ((this.courseService as any).getSubcategories) {
      (this.courseService as any).getSubcategories(categoryId).subscribe({
        next: (res: any) => {
          if (res.success && res.data && res.data.length > 0) {
            this.subcategories.set(res.data);
            subcatControl?.enable();
          } else {
            this.subcategories.set([]);
            subcatControl?.disable();
          }
          this.isLoadingSubcategories.set(false);
        },
        error: () => {
          this.subcategories.set([]);
          subcatControl?.disable();
          this.isLoadingSubcategories.set(false);
        },
      });
    } else {
      this.isLoadingSubcategories.set(false);
      subcatControl?.disable();
    }
  }

  private triggerFormTick(): void {
    this.formTick.update((v) => v + 1);
  }

  generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s\u200c]+/g, '-')
      // ⚠️ FIX: کاراکترهای فارسی/عربی را حفظ کن (فقط کاراکترهای کنترل و نمادهای خاص حذف شوند)
      .replace(/[^\p{L}\p{N}-]/gu, '')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);
  }

  getFullMediaUrl(url: string | null): string {
    if (!url) return '';
    if (
      url.startsWith('http') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    )
      return url;
    const baseUrl = environment.apiUrl.replace(/\/api\/v\d+$/, '');
    const normalizedUrl = url.startsWith('/') ? url : `/${url}`;
    return `${baseUrl}${normalizedUrl}`;
  }

  private parseNumber(val: any): number | null {
    if (val === null || val === undefined || val === '') return null;
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    let enStr = String(val).trim();
    enStr = enStr.replace(/[,\s]/g, '');
    enStr = enStr.replace(/[۰-۹]/g, (w) => persianDigits.indexOf(w).toString());
    enStr = enStr.replace(/[٠-٩]/g, (w) => arabicDigits.indexOf(w).toString());
    const num = Number(enStr);
    return isNaN(num) ? null : num;
  }

  /** تبدیل ارقام انگلیسی به فارسی (برای نمایش) */
  private faNum(n: number | string): string {
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    return String(n).replace(/\d/g, (d) => persianDigits[+d]);
  }

  private loadCourse(id: string): void {
    this.api.get<any>(`/courses/${id}`).subscribe({
      next: (res) => {
        if (this.restoredDraft) { this.hydratingCourse = false; return; }
        if (res.success && res.data) {
          const course = res.data;
          const catId = course.category?._id || course.category;

          this.courseStatus.set(course.status || 'draft');
          this.rejectionReason.set(course.rejectionReason || null);

          this.basicForm.patchValue({
            title: course.title,
            subtitle: course.subtitle,
            description: course.description,
            shortDescription: course.shortDescription,
            category: catId,
            subcategory: course.subCategory || course.subcategory || '',
            level: course.level,
            language: course.language,
          });

          const rawDate = course.discountEndsAt || course.discountEndDate;
          const parsedDate = rawDate ? new Date(rawDate) : null;

          const splitJalaliDateTime = (
            isoStr?: string
          ): { date: Date | null; time: string } => {
            if (!isoStr) return { date: null, time: '00:00' };
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return { date: null, time: '00:00' };
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return { date: d, time: `${hh}:${mm}` };
          };

          const cdStart = splitJalaliDateTime(
            course.countdownDiscount?.startAt
          );
          const cdEnd = splitJalaliDateTime(course.countdownDiscount?.endAt);

          this.pricingForm.patchValue(
            {
              price: course.price,
              discountPrice: course.discountPrice,
              discountEndDate: parsedDate,
              discountType: course.discountType || 'none',
              cdStartDate: cdStart.date,
              cdStartTime: cdStart.time,
              cdEndDate: cdEnd.date,
              cdEndTime: cdEnd.time,
              cdInitialPercent: course.countdownDiscount?.initialPercent ?? 100,
              cdFinalPercent: course.countdownDiscount?.finalPercent ?? 0,
              cdMode: course.countdownDiscount?.mode || 'linear',
              cdStepPercent: course.countdownDiscount?.stepPercent ?? 10,
              cdStepInterval:
                course.countdownDiscount?.stepIntervalMinutes ?? 30,
              isFree: course.isFree,
              hasCertificate: course.hasCertificate,
              hasLifetimeAccess: course.hasLifetimeAccess ?? true,
              hasSupport: course.hasSupport ?? false,
              installmentEnabled: course.installmentEnabled ?? false,
              installmentCount: course.installmentCount || 3,
              maxStudents: course.maxStudents,
            },
            { emitEvent: false }
          );

          this.seoForm.patchValue({
            slug: course.slug || this.generateSlug(course.title),
            metaTitle: course.metaTitle || course.title,
            metaDescription: course.metaDescription || course.shortDescription,
          });

          if (course.thumbnail) this.thumbnailPreview.set(course.thumbnail);
          if (course.promoVideo) this.promoVideoPreview.set(course.promoVideo);

          this.clearFormArray(this.tags);
          this.clearFormArray(this.requirements);
          this.clearFormArray(this.learningOutcomes);
          this.clearFormArray(this.targetAudience);
          this.clearFormArray(this.sections);

          (course.tags || []).forEach((t: string) =>
            this.tags.push(this.fb.control(t))
          );
          (course.requirements || []).forEach((r: string) =>
            this.requirements.push(this.fb.control(r))
          );
          (course.learningOutcomes || []).forEach((o: string) =>
            this.learningOutcomes.push(this.fb.control(o))
          );
          (course.targetAudience || []).forEach((a: string) =>
            this.targetAudience.push(this.fb.control(a))
          );

          const courseIsFree = Boolean(course.isFree);

          if (course.sections && course.sections.length > 0) {
            course.sections.forEach((sec: any) => {
              const lecturesArr = this.fb.array<FormGroup>([]);
              (sec.lectures || []).forEach((lec: any) => {
                const durationInSeconds = lec.duration || 0;
                const durationInMinutes = Math.round(durationInSeconds / 60);
                
                // Build content items array
                const contentItemsArr = this.fb.array<FormGroup>([]);
                (lec.contentItems || []).forEach((item: any) => {
                  contentItemsArr.push(
                    this.fb.group({
                      _id: [item._id || ''],
                      type: [item.type || 'video'],
                      title: [item.title || '', Validators.required],
                      description: [item.description || ''],
                      order: [item.order || 0],
                      // Video specific
                      videoUrl: [item.videoUrl || ''],
                      videoFileName: [item.videoFileName || ''],
                      videoFileSize: [item.videoFileSize || 0],
                      videoDuration: [item.videoDuration || 0],
                      // Rich text specific
                      richTextContent: [item.richTextContent || ''],
                      // Attachment specific
                      fileUrl: [item.fileUrl || ''],
                      fileName: [item.fileName || ''],
                      fileSize: [item.fileSize || 0],
                      fileType: [item.fileType || ''],
                      // External link specific
                      externalUrl: [item.externalUrl || ''],
                      // Image specific
                      imageUrl: [item.imageUrl || ''],
                      // Audio specific
                      audioUrl: [item.audioUrl || ''],
                      audioFileName: [item.audioFileName || ''],
                      audioFileSize: [item.audioFileSize || 0],
                      audioDuration: [item.audioDuration || 0],
                    })
                  );
                });

                lecturesArr.push(
                  this.fb.group({
                    title: [lec.title, Validators.required],
                    type: [lec.type || 'video'],
                    duration: [durationInMinutes],
                    isFreePreview: [
                      courseIsFree ? true : lec.isFreePreview || false,
                    ],
                    content: [lec.content || ''],
                    videoUrl: [lec.videoUrl || ''],
                    videoFileName: [lec.videoFileName || ''],
                    videoFileSize: [lec.videoFileSize || 0],
                    fileUrl: [lec.fileUrl || ''],
                    fileName: [lec.fileName || ''],
                    fileSize: [lec.fileSize || 0],
                    contentItems: contentItemsArr,
                  })
                );
              });

              this.sections.push(
                this.fb.group({
                  title: [sec.title, Validators.required],
                  description: [sec.description || ''],
                  lectures: lecturesArr,
                })
              );
            });
          }

          if (courseIsFree) this.unlockAllLectures();

          // ✅ NEW: بررسی وجود مسیر یادگیری مرتبط (فقط ادمین)
          if (this.isAdminUser) {
            this.loadExistingPathAssignment();
          }

          this.triggerFormTick();
        }
        this.hydratingCourse = false;
      },
      error: () => { this.hydratingCourse = false; },
    });
  }

  private clearFormArray(formArray: FormArray): void {
    while (formArray.length !== 0) formArray.removeAt(0);
  }

  getAsFormControl(control: AbstractControl | null): FormControl {
    return control as FormControl;
  }
  getAsFormControlValue(control: AbstractControl | null): any {
    return (control as FormControl | null)?.value;
  }
  getAsFormGroup(control: AbstractControl | null): FormGroup {
    return control as FormGroup;
  }

  getLectures(sectionIndex: number): FormArray {
    const section = this.sections.at(sectionIndex) as FormGroup;
    let lecturesControl = section.get('lectures');

    if (!(lecturesControl instanceof FormArray)) {
      const rawLectures = Array.isArray(lecturesControl?.value)
        ? lecturesControl?.value
        : [];
      const newFormArray = this.fb.array(
        rawLectures.map((lec: any) =>
          this.fb.group({
            title: [lec.title || '', Validators.required],
            type: [lec.type || 'video'],
            duration: [lec.duration || 0],
            isFreePreview: [lec.isFreePreview || false],
            content: [lec.content || ''],
            videoUrl: [lec.videoUrl || ''],
            videoFileName: [lec.videoFileName || ''],
            videoFileSize: [lec.videoFileSize || 0],
            fileUrl: [lec.fileUrl || ''],
            fileName: [lec.fileName || ''],
            fileSize: [lec.fileSize || 0],
          })
        )
      );
      section.setControl('lectures', newFormArray);
      lecturesControl = newFormArray;
    }

    return lecturesControl as FormArray;
  }

  get requirements(): FormArray { return this.basicForm.get('requirements') as FormArray; }
  get learningOutcomes(): FormArray { return this.basicForm.get('learningOutcomes') as FormArray; }
  get targetAudience(): FormArray { return this.basicForm.get('targetAudience') as FormArray; }
  get tags(): FormArray { return this.basicForm.get('tags') as FormArray; }
  get sections(): FormArray { return this.curriculumForm.get('sections') as FormArray; }
  get keywords(): FormArray { return this.seoForm.get('keywords') as FormArray; }

  /** ساخت آرایه requirementCourses با تطبیق عنوان پیش‌نیازها با دوره‌های موجود */
  buildRequirementCourses(): { _id: string; title: string; slug: string }[] {
    const reqs: string[] = this.requirements.value.filter((r: string) => r?.trim());
    const courses = this.allCourses();
    const result: { _id: string; title: string; slug: string }[] = [];
    for (const req of reqs) {
      const match = courses.find(
        (c: any) => c.title.trim().toLowerCase() === req.trim().toLowerCase()
      );
      if (match) {
        result.push({ _id: match._id, title: match.title, slug: match.slug });
      }
    }
    return result;
  }

  addRequirement(): void {
    this.requirements.push(this.fb.control('', Validators.required));
    this.triggerFormTick();
  }
  removeRequirement(i: number): void {
    this.requirements.removeAt(i);
    this.triggerFormTick();
  }
  addRequirementTag(): void {
    const val = this.reqInput().trim();
    if (!val || this.requirements.value.includes(val) || this.requirements.length >= 10) return;

    // بررسی کن آیا متن وارد شده دقیقاً با یک دوره موجود مطابقت دارد
    const matchedCourse = this.allCourses().find(
      (c: any) => c.title.trim() === val
    );

    this.requirements.push(this.fb.control(val));
    this.reqInput.set('');
    this.showReqDropdown.set(false);
    this.triggerFormTick();
  }
  removeRequirementTag(i: number): void {
    this.requirements.removeAt(i);
    this.triggerFormTick();
  }
  onReqInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.reqInput.set(val);
    this.filterReqCourses(val);
  }
  onReqKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.showReqDropdown.set(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      // اگر dropdown باز است و آیتمی انتخاب شده، آن را انتخاب کن
      if (this.showReqDropdown() && this.filteredReqCourses().length > 0) {
        this.selectReqCourse(this.filteredReqCourses()[0]);
      } else {
        this.addRequirementTag();
      }
    }
  }
  addOutcome(): void {
    this.learningOutcomes.push(this.fb.control('', Validators.required));
    this.triggerFormTick();
  }
  removeOutcome(i: number): void {
    this.learningOutcomes.removeAt(i);
    this.triggerFormTick();
  }
  addAudience(): void {
    this.targetAudience.push(this.fb.control('', Validators.required));
    this.triggerFormTick();
  }
  removeAudience(i: number): void {
    this.targetAudience.removeAt(i);
    this.triggerFormTick();
  }

  addTag(): void {
    const val = this.tagInput().trim();
    if (val && !this.tags.value.includes(val) && this.tags.length < 10) {
      this.tags.push(this.fb.control(val));
      this.tagInput.set('');
      this.triggerFormTick();
    }
  }
  removeTag(i: number): void {
    this.tags.removeAt(i);
    this.triggerFormTick();
  }
  onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTag();
    }
  }
  addKeyword(): void {
    this.keywords.push(this.fb.control(''));
    this.triggerFormTick();
  }
  removeKeyword(i: number): void {
    this.keywords.removeAt(i);
    this.triggerFormTick();
  }

  addSection(): void {
    this.sections.push(
      this.fb.group({
        title: ['', Validators.required],
        description: [''],
        lectures: this.fb.array<FormGroup>([]),
      })
    );
    const newIdx = this.sections.length - 1;
    const set = new Set(this.collapsedSections());
    set.delete(newIdx);
    this.collapsedSections.set(set);
    this.triggerFormTick();
  }

  removeSection(index: number): void {
    if (
      this.isBrowser() &&
      !confirm('آیا از حذف این فصل و تمام درس‌های آن مطمئن هستید؟')
    ) {
      return;
    }
    this.sections.removeAt(index);
    this.triggerFormTick();
  }

  duplicateSection(index: number): void {
    const src = this.sections.at(index).value;
    const free = this.isFreeCourse();
    const lecturesArr = this.fb.array<FormGroup>([]);
    (src.lectures || []).forEach((lec: any) => {
      lecturesArr.push(
        this.fb.group({
          title: [lec.title, Validators.required],
          type: [lec.type],
          duration: [lec.duration || 0],
          isFreePreview: [free ? true : lec.isFreePreview || false],
          content: [lec.content || ''],
          videoUrl: [lec.videoUrl || ''],
          videoFileName: [lec.videoFileName || ''],
          videoFileSize: [lec.videoFileSize || 0],
          fileUrl: [lec.fileUrl || ''],
          fileName: [lec.fileName || ''],
          fileSize: [lec.fileSize || 0],
        })
      );
    });

    const newSection = this.fb.group({
      title: [src.title + ' (کپی)', Validators.required],
      description: [src.description],
      lectures: lecturesArr,
    });

    this.sections.insert(index + 1, newSection);
    this.showToast('✅ فصل کپی شد', 'success');
    this.triggerFormTick();
  }

  toggleSection(index: number): void {
    const set = new Set(this.collapsedSections());
    if (set.has(index)) set.delete(index);
    else set.add(index);
    this.collapsedSections.set(set);
  }

  isSectionCollapsed(index: number): boolean {
    return this.collapsedSections().has(index);
  }

  addLecture(sectionIndex: number): void {
    const lecturesArray = this.getLectures(sectionIndex);
    lecturesArray.push(
      this.fb.group({
        title: ['', Validators.required],
        type: ['video'],
        duration: [0],
        isFreePreview: [this.isFreeCourse()],
        content: [''],
        videoUrl: [''],
        videoFileName: [''],
        videoFileSize: [0],
        fileUrl: [''],
        fileName: [''],
        fileSize: [0],
        contentItems: this.fb.array([]),
      })
    );
    this.triggerFormTick();
  }

  removeLecture(sectionIndex: number, lectureIndex: number): void {
    const lecturesArray = this.getLectures(sectionIndex);
    lecturesArray.removeAt(lectureIndex);
    this.triggerFormTick();
  }

  moveLectureUp(sectionIndex: number, lectureIndex: number): void {
    if (lectureIndex === 0) return;
    const lectures = this.getLectures(sectionIndex);
    const current = lectures.at(lectureIndex);
    const prev = lectures.at(lectureIndex - 1);
    lectures.setControl(lectureIndex - 1, current);
    lectures.setControl(lectureIndex, prev);
    this.triggerFormTick();
  }

  moveLectureDown(sectionIndex: number, lectureIndex: number): void {
    const lectures = this.getLectures(sectionIndex);
    if (lectureIndex === lectures.length - 1) return;
    const current = lectures.at(lectureIndex);
    const next = lectures.at(lectureIndex + 1);
    lectures.setControl(lectureIndex + 1, current);
    lectures.setControl(lectureIndex, next);
    this.triggerFormTick();
  }

  /** Move a lecture to another section within the same course */
  async moveLectureToSection(
    sectionIndex: number,
    lectureIndex: number,
    targetSectionIndex: number
  ): Promise<void> {
    const courseId = this.courseId();
    if (!courseId) return;

    const sourceLectures = this.getLectures(sectionIndex);
    const targetLectures = this.getLectures(targetSectionIndex);

    const lectureControl = sourceLectures.at(lectureIndex) as import('@angular/forms').FormGroup;
    const lectureValue = lectureControl.value;

    // Remove from source section
    sourceLectures.removeAt(lectureIndex);

    // Add to target section at the end
    const newOrder = targetLectures.length;
    targetLectures.push(
      this.fb.group({
        title: [lectureValue.title || '', Validators.required],
        type: [lectureValue.type || 'video'],
        duration: [lectureValue.duration || 0],
        isFreePreview: [lectureValue.isFreePreview || false],
        content: [lectureValue.content || ''],
        videoUrl: [lectureValue.videoUrl || ''],
        videoFileName: [lectureValue.videoFileName || ''],
        videoFileSize: [lectureValue.videoFileSize || 0],
        fileUrl: [lectureValue.fileUrl || ''],
        fileName: [lectureValue.fileName || ''],
        fileSize: [lectureValue.fileSize || 0],
        contentItems: lectureValue.contentItems
          ? this.fb.array(
              lectureValue.contentItems.map((item: any) =>
                this.fb.group({
                  _id: [item._id || ''],
                  type: [item.type || 'video'],
                  title: [item.title || '', Validators.required],
                  description: [item.description || ''],
                  order: [item.order || 0],
                  isRequired: [item.isRequired || false],
                  videoUrl: [item.videoUrl || ''],
                  videoFileName: [item.videoFileName || ''],
                  videoFileSize: [item.videoFileSize || 0],
                  videoDuration: [item.videoDuration || 0],
                  richTextContent: [item.richTextContent || ''],
                  fileUrl: [item.fileUrl || ''],
                  fileName: [item.fileName || ''],
                  fileSize: [item.fileSize || 0],
                  fileType: [item.fileType || ''],
                  externalUrl: [item.externalUrl || ''],
                  imageUrl: [item.imageUrl || ''],
                  audioUrl: [item.audioUrl || ''],
                  audioFileName: [item.audioFileName || ''],
                  audioFileSize: [item.audioFileSize || 0],
                  audioDuration: [item.audioDuration || 0],
                })
              )
            )
          : this.fb.array([]),
      })
    );

    this.triggerFormTick();

    // Sync to backend via API
    try {
      await firstValueFrom(
        this.lectureService.moveLectureToSection(
          courseId,
          this.sections.at(sectionIndex).get('_id')?.value || '',
          lectureValue._id || '',
          this.sections.at(targetSectionIndex).get('_id')?.value || ''
        )
      );
    } catch (err) {
      this.handleApiError(err, 'خطا در انتقال درس به فصل جدید');
    }
  }

  moveSectionUp(index: number): void {
    if (index === 0) return;
    const current = this.sections.at(index);
    const prev = this.sections.at(index - 1);
    this.sections.setControl(index - 1, current);
    this.sections.setControl(index, prev);
    this.triggerFormTick();
  }

  moveSectionDown(index: number): void {
    if (index === this.sections.length - 1) return;
    const current = this.sections.at(index);
    const next = this.sections.at(index + 1);
    this.sections.setControl(index + 1, current);
    this.sections.setControl(index, next);
    this.triggerFormTick();
  }

  dropSection(event: CdkDragDrop<any[]>): void {
    moveItemInArray(
      this.sections.controls,
      event.previousIndex,
      event.currentIndex
    );
    this.sections.updateValueAndValidity();
    this.triggerFormTick();
  }

  dropLecture(event: CdkDragDrop<any[]>, sectionIndex: number): void {
    const lecturesArray = this.getLectures(sectionIndex);
    moveItemInArray(
      lecturesArray.controls,
      event.previousIndex,
      event.currentIndex
    );
    lecturesArray.updateValueAndValidity();
    this.triggerFormTick();
  }

  triggerThumbnailUpload(): void {
    this.thumbnailInput?.nativeElement.click();
  }
  triggerPromoUpload(): void {
    this.promoVideoInput?.nativeElement.click();
  }

  async onThumbnailSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('لطفاً یک فایل تصویری انتخاب کنید', 'error');
      input.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.showToast('حجم تصویر باید کمتر از ۲ مگابایت باشد', 'error');
      input.value = '';
      return;
    }

    const courseId = await this.ensureCourseSaved();
    if (!courseId) {
      input.value = '';
      return;
    }

    this.isUploadingThumbnail.set(true);
    this.thumbnailUploadProgress.set(0);
    this.courseService.uploadThumbnail(courseId, file).subscribe({
      next: (event: any) => {
        if (event.type === 'progress') {
          this.thumbnailUploadProgress.set(event.progress || 0);
        } else if (event.type === 'success') {
          this.isUploadingThumbnail.set(false);
          this.thumbnailUploadProgress.set(100);
          const url = event.url;
          if (url) {
            this.thumbnailPreview.set(url);
            this.mediaForm.patchValue({ thumbnailUrl: url });
            this.showToast('پوستر با موفقیت آپلود شد', 'success');
            this.triggerFormTick();
          }
        } else if (event.type === 'error') {
          this.isUploadingThumbnail.set(false);
          this.handleApiError(event.error, 'خطا در آپلود تصویر شاخص');
        }
      },
      error: (err: any) => {
        this.isUploadingThumbnail.set(false);
        this.handleApiError(err, 'خطا در آپلود تصویر شاخص');
      },
    });

    input.value = '';
  }

  removeThumbnail(): void {
    this.thumbnailPreview.set(null);
    this.mediaForm.patchValue({ thumbnailUrl: '' });
    if (this.thumbnailInput) this.thumbnailInput.nativeElement.value = '';
    this.triggerFormTick();
  }

  async onPromoVideoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      this.showToast('لطفاً یک فایل ویدیویی انتخاب کنید', 'error');
      input.value = '';
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      this.showToast('حجم ویدیو معرفی نباید بیشتر از ۵۰۰ مگابایت باشد', 'error');
      input.value = '';
      return;
    }

    const courseId = await this.ensureCourseSaved();
    if (!courseId) {
      input.value = '';
      return;
    }

    this.isUploadingVideo.set(true);
    this.promoUploadProgress.set(0);

    this.videoUploadService
      .uploadVideo(
        file,
        null,
        courseId,
        'promo-video',
        (evt: UploadProgressEvent) => {
          if (evt.type === 'progress') {
            this.promoUploadProgress.set(evt.progress || 0);
          } else if (evt.type === 'status' && evt.status === 'PROCESSING') {
            this.showToast('ویدیو در حال پردازش است...', 'success');
          } else if (evt.type === 'status' && evt.status === 'READY') {
            this.isUploadingVideo.set(false);
            this.promoUploadProgress.set(100);
          } else if (evt.type === 'error') {
            this.isUploadingVideo.set(false);
            this.handleApiError(evt.error, 'خطا در آپلود ویدیو معرفی');
          }
        }
      )
      .then((result) => {
        this.isUploadingVideo.set(false);
        this.promoUploadProgress.set(100);
        this.promoVideoPreview.set(result.url);
        this.mediaForm.patchValue({ promoVideoUrl: result.url });
        this.showToast('ویدیو معرفی با موفقیت آپلود شد', 'success');
        this.triggerFormTick();
      })
      .catch((err: any) => {
        this.isUploadingVideo.set(false);
        this.handleApiError(err, 'خطا در آپلود ویدیو معرفی');
      });

    input.value = '';
  }

  removePromoVideo(): void {
    this.promoVideoPreview.set(null);
    this.mediaForm.patchValue({ promoVideoUrl: '' });
    if (this.promoVideoInput) this.promoVideoInput.nativeElement.value = '';
    this.triggerFormTick();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add('drag-over');
  }
  onDragLeave(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
  }
  onThumbnailDrop(event: DragEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
    const file = event.dataTransfer?.files[0];
    if (file) {
      const fakeEvent = {
        target: { files: [file] },
      } as unknown as Event;
      this.onThumbnailSelected(fakeEvent);
    }
  }

  private async ensureCourseSaved(): Promise<string | null> {
    if (this.courseId()) return this.courseId();

    const title = this.basicForm.get('title')?.value?.trim();
    const category = this.basicForm.get('category')?.value;

    if (!title || title.length < 10) {
      this.showToast(
        'لطفاً ابتدا عنوان دوره را وارد کنید (حداقل ۱۰ کاراکتر)',
        'error'
      );
      this.goToStep(1);
      return null;
    }

    if (!category) {
      this.showToast('لطفاً دسته‌بندی دوره را در مرحله اول انتخاب کنید', 'error');
      this.goToStep(1);
      return null;
    }

    this.showToast('در حال ذخیره اولیه دوره...', 'success');
    return new Promise((resolve) => {
      const payload = this.assembleMinimalPayload();
      this.api.post<any>('/courses', payload).subscribe({
        next: (res: any) => {
          if (res.success && res.data) {
            this.courseId.set(res.data._id);
            this.isEditMode = true;
            this.saveDraftToLocalStorage();
            resolve(res.data._id);
          } else {
            resolve(null);
          }
        },
        error: (err: any) => {
          this.handleApiError(err, 'خطا در ایجاد دوره اولیه');
          resolve(null);
        },
      });
    });
  }

  async onLectureVideoSelected(
    event: Event,
    sectionIdx: number,
    lectureIdx: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      this.showToast('لطفاً یک فایل ویدیویی معتبر انتخاب کنید', 'error');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024 * 1024) {
      this.showToast('حجم ویدیو نباید بیشتر از ۵ گیگابایت باشد', 'error');
      input.value = '';
      return;
    }

    const courseId = await this.ensureCourseSaved();
    if (!courseId) return;

    const key = `${sectionIdx}-${lectureIdx}-video`;
    this.setLectureUploadStatus(key, 'uploading');
    this.setLectureUploadProgress(key, 0);

    this.videoUploadService
      .uploadVideo(
        file,
        null,
        courseId,
        'lecture-video',
        (evt: UploadProgressEvent) => {
          if (evt.type === 'progress') {
            this.setLectureUploadProgress(key, evt.progress || 0);
          } else if (evt.type === 'error') {
            this.setLectureUploadStatus(key, 'error');
            this.handleApiError(evt.error, 'خطا در آپلود ویدیو درس');
            setTimeout(() => this.clearLectureUploadState(key), 3000);
          }
        }
      )
      .then((result) => {
        this.setLectureUploadStatus(key, 'success');
        this.setLectureUploadProgress(key, 100);

        const lecture = this.getLectures(sectionIdx).at(lectureIdx) as FormGroup;
        lecture.patchValue({
          videoUrl: result.url,
          videoFileName: file.name,
          videoFileSize: file.size,
          duration:
            result.duration > 0
              ? Math.round(result.duration / 60)
              : lecture.get('duration')?.value || 0,
        });

        if (this.isFreeCourse()) {
          lecture.get('isFreePreview')?.setValue(true, { emitEvent: false });
        }

        this.showToast(`ویدیوی "${file.name}" با موفقیت آپلود شد`, 'success');
        this.triggerFormTick();

        setTimeout(() => {
          this.clearLectureUploadState(key);
        }, 2000);
      })
      .catch((err: any) => {
        this.setLectureUploadStatus(key, 'error');
        this.handleApiError(err, 'خطا در آپلود ویدیو درس');
        setTimeout(() => this.clearLectureUploadState(key), 3000);
      });

    input.value = '';
  }

  async onLectureResourceSelected(
    event: Event,
    sectionIdx: number,
    lectureIdx: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      this.showToast('حجم فایل نباید بیشتر از ۱۰۰ مگابایت باشد', 'error');
      input.value = '';
      return;
    }

    const courseId = await this.ensureCourseSaved();
    if (!courseId) return;

    const key = `${sectionIdx}-${lectureIdx}-file`;
    this.setLectureUploadStatus(key, 'uploading');
    this.setLectureUploadProgress(key, 0);

    this.videoUploadService
      .uploadVideo(file, null, courseId, 'resource', (evt: UploadProgressEvent) => {
        if (evt.type === 'progress') {
          this.setLectureUploadProgress(key, evt.progress || 0);
        } else if (evt.type === 'error') {
          this.setLectureUploadStatus(key, 'error');
          this.handleApiError(evt.error, 'خطا در آپلود فایل');
          setTimeout(() => this.clearLectureUploadState(key), 3000);
        }
      })
      .then((result) => {
        this.setLectureUploadStatus(key, 'success');
        this.setLectureUploadProgress(key, 100);

        const lecture = this.getLectures(sectionIdx).at(lectureIdx) as FormGroup;
        lecture.patchValue({
          fileUrl: result.url,
          fileName: file.name,
          fileSize: file.size,
        });

        if (this.isFreeCourse()) {
          lecture.get('isFreePreview')?.setValue(true, { emitEvent: false });
        }

        this.showToast(`فایل "${file.name}" با موفقیت آپلود شد`, 'success');
        this.triggerFormTick();

        setTimeout(() => this.clearLectureUploadState(key), 2000);
      })
      .catch((err: any) => {
        this.setLectureUploadStatus(key, 'error');
        this.handleApiError(err, 'خطا در آپلود فایل');
        setTimeout(() => this.clearLectureUploadState(key), 3000);
      });

    input.value = '';
  }

  removeLectureVideo(sectionIdx: number, lectureIdx: number): void {
    if (this.isBrowser() && !confirm('آیا از حذف این ویدیو مطمئن هستید؟')) return;
    const lecture = this.getLectures(sectionIdx).at(lectureIdx) as FormGroup;
    lecture.patchValue({
      videoUrl: '',
      videoFileName: '',
      videoFileSize: 0,
    });
    this.triggerFormTick();
  }

  removeLectureResource(sectionIdx: number, lectureIdx: number): void {
    if (this.isBrowser() && !confirm('آیا از حذف این فایل مطمئن هستید؟')) return;
    const lecture = this.getLectures(sectionIdx).at(lectureIdx) as FormGroup;
    lecture.patchValue({
      fileUrl: '',
      fileName: '',
      fileSize: 0,
    });
    this.triggerFormTick();
  }

  // ==================== CONTENT ITEMS MANAGEMENT ====================

  /** Get content items FormArray for a lecture */
  getContentItems(sectionIndex: number, lectureIndex: number): FormArray {
    const lecture = this.getLectures(sectionIndex).at(lectureIndex) as FormGroup;
    let contentItemsControl = lecture.get('contentItems');

    if (!(contentItemsControl instanceof FormArray)) {
      const rawItems = Array.isArray(contentItemsControl?.value)
        ? contentItemsControl?.value
        : [];
      const newFormArray = this.fb.array(
        rawItems.map((item: any) =>
          this.fb.group({
            _id: [item._id || ''],
            type: [item.type || 'video'],
            title: [item.title || '', Validators.required],
            description: [item.description || ''],
            order: [item.order || 0],
            // Video specific
            videoUrl: [item.videoUrl || ''],
            videoFileName: [item.videoFileName || ''],
            videoFileSize: [item.videoFileSize || 0],
            videoDuration: [item.videoDuration || 0],
            // Rich text specific
            richTextContent: [item.richTextContent || ''],
            // Attachment specific
            fileUrl: [item.fileUrl || ''],
            fileName: [item.fileName || ''],
            fileSize: [item.fileSize || 0],
            fileType: [item.fileType || ''],
            // External link specific
            externalUrl: [item.externalUrl || ''],
            // Image specific
            imageUrl: [item.imageUrl || ''],
            // Audio specific
            audioUrl: [item.audioUrl || ''],
            audioFileName: [item.audioFileName || ''],
            audioFileSize: [item.audioFileSize || 0],
            audioDuration: [item.audioDuration || 0],
          })
        )
      );
      lecture.setControl('contentItems', newFormArray);
      contentItemsControl = newFormArray;
    }

    return contentItemsControl as FormArray;
  }

  /**
   * Extract content items from form for syncing to backend
   * Returns array of content item objects ready for API
   */
  private getContentItemsForSync(sectionIndex: number, lectureIndex: number): any[] {
    const contentItemsArray = this.getContentItems(sectionIndex, lectureIndex);
    return contentItemsArray.controls
      .map((item: AbstractControl) => {
        const itemValue = item.value;
        // Only include items with a valid title
        if (!itemValue.title?.trim()) return null;
        
        return {
          _id: itemValue._id || undefined,
          type: itemValue.type || 'video',
          title: itemValue.title?.trim(),
          description: itemValue.description?.trim() || '',
          order: itemValue.order || 0,
          isRequired: itemValue.isRequired || false,
          // Video specific
          videoUrl: itemValue.videoUrl || '',
          videoFileName: itemValue.videoFileName || '',
          videoFileSize: Number(itemValue.videoFileSize) || 0,
          videoDuration: Number(itemValue.videoDuration) || 0,
          // Storage info (for S3 key)
          storage: itemValue.storage || { provider: 'arvan', bucket: '', key: '', originalFileName: '' },
          // Rich text specific
          richTextContent: itemValue.richTextContent || '',
          // Attachment specific
          fileUrl: itemValue.fileUrl || '',
          fileName: itemValue.fileName || '',
          fileSize: Number(itemValue.fileSize) || 0,
          fileType: itemValue.fileType || '',
          // External link specific
          externalUrl: itemValue.externalUrl || '',
          // Image specific
          imageUrl: itemValue.imageUrl || '',
          // Audio specific
          audioUrl: itemValue.audioUrl || '',
          audioFileName: itemValue.audioFileName || '',
          audioFileSize: Number(itemValue.audioFileSize) || 0,
          audioDuration: Number(itemValue.audioDuration) || 0,
        };
      })
      .filter((item): item is any => item !== null);
  }

  /** Add a content item to a lecture */
  addContentItem(sectionIndex: number, lectureIndex: number, type: 'video' | 'rich-text' | 'attachment' | 'external-link' | 'image' | 'audio' = 'video'): void {
    const contentItemsArray = this.getContentItems(sectionIndex, lectureIndex);
    const order = contentItemsArray.length;
    
    const baseGroup = {
      _id: [''],
      type: [type],
      title: ['', Validators.required],
      description: [''],
      order: [order],
      isRequired: [false],
      // Video specific
      videoUrl: [''],
      videoFileName: [''],
      videoFileSize: [0],
      videoDuration: [0],
      // Storage info (for S3 key)
      storage: this.fb.group({
        provider: ['arvan'],
        bucket: [''],
        key: [''],
        originalFileName: [''],
      }),
      // Rich text specific
      richTextContent: [''],
      // Attachment specific
      fileUrl: [''],
      fileName: [''],
      fileSize: [0],
      fileType: [''],
      // External link specific
      externalUrl: [''],
      // Image specific
      imageUrl: [''],
      // Audio specific
      audioUrl: [''],
      audioFileName: [''],
      audioFileSize: [0],
      audioDuration: [0],
    };

    contentItemsArray.push(this.fb.group(baseGroup));
    this.triggerFormTick();
  }

  /** Remove a content item */
  removeContentItem(sectionIndex: number, lectureIndex: number, contentItemIndex: number): void {
    const contentItemsArray = this.getContentItems(sectionIndex, lectureIndex);
    contentItemsArray.removeAt(contentItemIndex);
    this.triggerFormTick();
  }

  /** Move content item up */
  moveContentItemUp(sectionIndex: number, lectureIndex: number, contentItemIndex: number): void {
    if (contentItemIndex === 0) return;
    const contentItems = this.getContentItems(sectionIndex, lectureIndex);
    const current = contentItems.at(contentItemIndex);
    const prev = contentItems.at(contentItemIndex - 1);
    contentItems.setControl(contentItemIndex - 1, current);
    contentItems.setControl(contentItemIndex, prev);
    this.triggerFormTick();
  }

  /** Move content item down */
  moveContentItemDown(sectionIndex: number, lectureIndex: number, contentItemIndex: number): void {
    const contentItems = this.getContentItems(sectionIndex, lectureIndex);
    if (contentItemIndex === contentItems.length - 1) return;
    const current = contentItems.at(contentItemIndex);
    const next = contentItems.at(contentItemIndex + 1);
    contentItems.setControl(contentItemIndex + 1, current);
    contentItems.setControl(contentItemIndex, next);
    this.triggerFormTick();
  }

  /** Reorder content items via drag & drop */
  dropContentItem(event: CdkDragDrop<any[]>, sectionIndex: number, lectureIndex: number): void {
    const contentItemsArray = this.getContentItems(sectionIndex, lectureIndex);
    moveItemInArray(
      contentItemsArray.controls,
      event.previousIndex,
      event.currentIndex
    );
    contentItemsArray.updateValueAndValidity();
    this.triggerFormTick();
  }

  /**
   * ⭐ FIX: قبل از آپلود فایل، contentItem باید در بک‌اند ایجاد شود تا _id دریافت کنیم
   * سپس با آن contentItemId آپلود می‌کنیم تا بک‌اند key را در contentItem مربوطه ذخیره کند
   */
  private async ensureContentItemSaved(
    sectionIdx: number,
    lectureIdx: number,
    contentItemIdx: number
  ): Promise<{ contentItemId: string; sectionId: string; lectureId: string } | null> {
    const courseId = this.courseId();
    if (!courseId) {
      this.showToast('ابتدا دوره را ذخیره کنید', 'error');
      return null;
    }

    const sectionGroup = this.sections.at(sectionIdx) as FormGroup;
    let sectionId = sectionGroup.get('_id')?.value || '';

    if (!sectionId) {
      try {
        const secRes = await firstValueFrom(
          this.sectionService.createSection(courseId, {
            title: sectionGroup.get('title')?.value?.trim() || `فصل ${sectionIdx + 1}`,
            description: sectionGroup.get('description')?.value?.trim() || '',
          })
        );
        if (!secRes?.data) return null;
        sectionId = secRes.data._id;
        if (!sectionGroup.contains('_id')) {
          sectionGroup.addControl('_id', this.fb.control(sectionId));
        } else {
          sectionGroup.get('_id')?.setValue(sectionId);
        }
      } catch (e) {
        this.handleApiError(e, 'خطا در ایجاد فصل');
        return null;
      }
    }

    const lectureGroup = this.getLectures(sectionIdx).at(lectureIdx) as FormGroup;
    let lectureId = lectureGroup.get('_id')?.value || '';

    if (!lectureId) {
      try {
        const lecRes = await firstValueFrom(
          this.lectureService.createLecture(courseId, sectionId, {
            title: lectureGroup.get('title')?.value?.trim() || `درس ${lectureIdx + 1}`,
            type: lectureGroup.get('type')?.value || 'video',
            duration: (Number(lectureGroup.get('duration')?.value) || 0) * 60,
            isFreePreview: Boolean(lectureGroup.get('isFreePreview')?.value),
            order: lectureIdx,
          })
        );
        if (!lecRes?.data) return null;
        lectureId = lecRes.data._id;
        if (!lectureGroup.contains('_id')) {
          lectureGroup.addControl('_id', this.fb.control(lectureId));
        } else {
          lectureGroup.get('_id')?.setValue(lectureId);
        }
      } catch (e) {
        this.handleApiError(e, 'خطا در ایجاد درس');
        return null;
      }
    }

    const contentItemGroup = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
    let contentItemId = contentItemGroup.get('_id')?.value || '';

    if (!contentItemId) {
      try {
        const ciRes = await firstValueFrom(
          this.lectureService.addContentItem(courseId, sectionId, lectureId, {
            type: contentItemGroup.get('type')?.value || 'video',
            title: contentItemGroup.get('title')?.value?.trim() || `محتوا ${contentItemIdx + 1}`,
            description: contentItemGroup.get('description')?.value?.trim() || '',
            order: contentItemIdx,
          })
        );
        if (!ciRes?.data) return null;
        contentItemId = ciRes.data._id;
        contentItemGroup.get('_id')?.setValue(contentItemId);
      } catch (e) {
        this.handleApiError(e, 'خطا در ایجاد محتوا');
        return null;
      }
    }

    return { contentItemId, sectionId, lectureId };
  }

  async onContentItemVideoSelected(
    event: Event, sectionIdx: number, lectureIdx: number, contentItemIdx: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      this.showToast('لطفاً یک فایل ویدیویی معتبر انتخاب کنید', 'error');
      input.value = ''; return;
    }
    if (file.size > 5 * 1024 * 1024 * 1024) {
      this.showToast('حجم ویدیو نباید بیشتر از ۵ گیگابایت باشد', 'error');
      input.value = ''; return;
    }
    const courseId = await this.ensureCourseSaved();
    if (!courseId) return;
    const ids = await this.ensureContentItemSaved(sectionIdx, lectureIdx, contentItemIdx);
    if (!ids) { input.value = ''; return; }

    const key = `${sectionIdx}-${lectureIdx}-${contentItemIdx}-video`;
    this.setLectureUploadStatus(key, 'uploading');
    this.setLectureUploadProgress(key, 0);

    this.videoUploadService
      .uploadVideo(
        file, ids.lectureId, courseId, 'lecture-video',
        (evt: UploadProgressEvent) => {
          if (evt.type === 'progress') this.setLectureUploadProgress(key, evt.progress || 0);
          else if (evt.type === 'error') {
            this.setLectureUploadStatus(key, 'error');
            this.handleApiError(evt.error, 'خطا در آپلود ویدیو محتوا');
            setTimeout(() => this.clearLectureUploadState(key), 3000);
          }
        },
        undefined,          // abortSignal
        ids.contentItemId   // ⭐ contentItemId (آخرین آرگومان)
      )
      .then((result) => {
        this.setLectureUploadStatus(key, 'success');
        this.setLectureUploadProgress(key, 100);
        const ci = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
        ci.patchValue({
          videoUrl: result.url, videoFileName: file.name,
          videoFileSize: file.size,
          videoDuration: result.duration > 0 ? Math.round(result.duration / 60) : 0,
          storage: { provider: 'arvan', bucket: 'iranian-udemy-videos', key: result.key, originalFileName: file.name },
        });
        this.showToast(`ویدیوی "${file.name}" با موفقیت آپلود شد`, 'success');
        this.triggerFormTick();
        setTimeout(() => this.clearLectureUploadState(key), 2000);
      })
      .catch((err: any) => {
        this.setLectureUploadStatus(key, 'error');
        this.handleApiError(err, 'خطا در آپلود ویدیو محتوا');
        setTimeout(() => this.clearLectureUploadState(key), 3000);
      });
    input.value = '';
  }


async onContentItemFileSelected(
    event: Event, sectionIdx: number, lectureIdx: number, contentItemIdx: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      this.showToast('حجم فایل نباید بیشتر از ۱۰۰ مگابایت باشد', 'error');
      input.value = ''; return;
    }
    const courseId = await this.ensureCourseSaved();
    if (!courseId) return;
    const ids = await this.ensureContentItemSaved(sectionIdx, lectureIdx, contentItemIdx);
    if (!ids) { input.value = ''; return; }

    const key = `${sectionIdx}-${lectureIdx}-${contentItemIdx}-file`;
    this.setLectureUploadStatus(key, 'uploading');
    this.setLectureUploadProgress(key, 0);

    this.videoUploadService
      .uploadVideo(
        file, ids.lectureId, courseId, 'resource',
        (evt: UploadProgressEvent) => {
          if (evt.type === 'progress') this.setLectureUploadProgress(key, evt.progress || 0);
          else if (evt.type === 'error') {
            this.setLectureUploadStatus(key, 'error');
            this.handleApiError(evt.error, 'خطا در آپلود فایل');
            setTimeout(() => this.clearLectureUploadState(key), 3000);
          }
        },
        undefined,
        ids.contentItemId
      )
      .then((result) => {
        this.setLectureUploadStatus(key, 'success');
        this.setLectureUploadProgress(key, 100);
        const ci = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
        ci.patchValue({
          fileUrl: result.url, fileName: file.name,
          fileSize: file.size, fileType: file.type,
          storage: { provider: 'arvan', bucket: 'iranian-udemy-videos', key: result.key, originalFileName: file.name },
        });
        this.showToast(`فایل "${file.name}" با موفقیت آپلود شد`, 'success');
        this.triggerFormTick();
        setTimeout(() => this.clearLectureUploadState(key), 2000);
      })
      .catch((err: any) => {
        this.setLectureUploadStatus(key, 'error');
        this.handleApiError(err, 'خطا در آپلود فایل');
        setTimeout(() => this.clearLectureUploadState(key), 3000);
      });
    input.value = '';
  }
  async onContentItemImageSelected(
    event: Event, sectionIdx: number, lectureIdx: number, contentItemIdx: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.showToast('لطفاً یک فایل تصویری انتخاب کنید', 'error');
      input.value = ''; return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.showToast('حجم تصویر باید کمتر از ۱۰ مگابایت باشد', 'error');
      input.value = ''; return;
    }
    const courseId = await this.ensureCourseSaved();
    if (!courseId) return;
    const ids = await this.ensureContentItemSaved(sectionIdx, lectureIdx, contentItemIdx);
    if (!ids) { input.value = ''; return; }

    const key = `${sectionIdx}-${lectureIdx}-${contentItemIdx}-image`;
    this.setLectureUploadStatus(key, 'uploading');
    this.setLectureUploadProgress(key, 0);

    this.videoUploadService
      .uploadVideo(
        file, ids.lectureId, courseId, 'resource',
        (evt: UploadProgressEvent) => {
          if (evt.type === 'progress') this.setLectureUploadProgress(key, evt.progress || 0);
          else if (evt.type === 'error') {
            this.setLectureUploadStatus(key, 'error');
            this.handleApiError(evt.error, 'خطا در آپلود تصویر');
            setTimeout(() => this.clearLectureUploadState(key), 3000);
          }
        },
        undefined,
        ids.contentItemId
      )
      .then((result) => {
        this.setLectureUploadStatus(key, 'success');
        this.setLectureUploadProgress(key, 100);
        const ci = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
        ci.patchValue({
          imageUrl: result.url, fileName: file.name, fileSize: file.size,
          storage: { provider: 'arvan', bucket: 'iranian-udemy-videos', key: result.key, originalFileName: file.name },
        });
        this.showToast(`تصویر "${file.name}" با موفقیت آپلود شد`, 'success');
        this.triggerFormTick();
        setTimeout(() => this.clearLectureUploadState(key), 2000);
      })
      .catch((err: any) => {
        this.setLectureUploadStatus(key, 'error');
        this.handleApiError(err, 'خطا در آپلود تصویر');
        setTimeout(() => this.clearLectureUploadState(key), 3000);
      });
    input.value = '';
  }

  async onContentItemAudioSelected(
    event: Event, sectionIdx: number, lectureIdx: number, contentItemIdx: number
  ): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      this.showToast('لطفاً یک فایل صوتی معتبر انتخاب کنید', 'error');
      input.value = ''; return;
    }
    if (file.size > 100 * 1024 * 1024) {
      this.showToast('حجم فایل صوتی نباید بیشتر از ۱۰۰ مگابایت باشد', 'error');
      input.value = ''; return;
    }
    const courseId = await this.ensureCourseSaved();
    if (!courseId) return;
    const ids = await this.ensureContentItemSaved(sectionIdx, lectureIdx, contentItemIdx);
    if (!ids) { input.value = ''; return; }

    const key = `${sectionIdx}-${lectureIdx}-${contentItemIdx}-audio`;
    this.setLectureUploadStatus(key, 'uploading');
    this.setLectureUploadProgress(key, 0);

    this.videoUploadService
      .uploadVideo(
        file, ids.lectureId, courseId, 'audio',
        (evt: UploadProgressEvent) => {
          if (evt.type === 'progress') this.setLectureUploadProgress(key, evt.progress || 0);
          else if (evt.type === 'error') {
            this.setLectureUploadStatus(key, 'error');
            this.handleApiError(evt.error, 'خطا در آپلود فایل صوتی');
            setTimeout(() => this.clearLectureUploadState(key), 3000);
          }
        },
        undefined,
        ids.contentItemId
      )
      .then((result) => {
        this.setLectureUploadStatus(key, 'success');
        this.setLectureUploadProgress(key, 100);
        const ci = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
        ci.patchValue({
          audioUrl: result.url, audioFileName: file.name,
          audioFileSize: file.size,
          audioDuration: result.duration > 0 ? Math.round(result.duration / 60) : 0,
          storage: { provider: 'arvan', bucket: 'iranian-udemy-videos', key: result.key, originalFileName: file.name },
        });
        this.showToast(`فایل صوتی "${file.name}" با موفقیت آپلود شد`, 'success');
        this.triggerFormTick();
        setTimeout(() => this.clearLectureUploadState(key), 2000);
      })
      .catch((err: any) => {
        this.setLectureUploadStatus(key, 'error');
        this.handleApiError(err, 'خطا در آپلود فایل صوتی');
        setTimeout(() => this.clearLectureUploadState(key), 3000);
      });
    input.value = '';
  }
  /** Remove content item video */
  removeContentItemVideo(sectionIdx: number, lectureIdx: number, contentItemIdx: number): void {
    if (this.isBrowser() && !confirm('آیا از حذف این ویدیو مطمئن هستید؟')) return;
    const contentItem = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
    contentItem.patchValue({
      videoUrl: '',
      videoFileName: '',
      videoFileSize: 0,
      videoDuration: 0,
    });
    this.triggerFormTick();
  }

  /** Remove content item file */
  removeContentItemFile(sectionIdx: number, lectureIdx: number, contentItemIdx: number): void {
    if (this.isBrowser() && !confirm('آیا از حذف این فایل مطمئن هستید؟')) return;
    const contentItem = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
    contentItem.patchValue({
      fileUrl: '',
      fileName: '',
      fileSize: 0,
      fileType: '',
    });
    this.triggerFormTick();
  }

  /** Remove content item image */
  removeContentItemImage(sectionIdx: number, lectureIdx: number, contentItemIdx: number): void {
    if (this.isBrowser() && !confirm('آیا از حذف این تصویر مطمئن هستید؟')) return;
    const contentItem = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
    contentItem.patchValue({
      imageUrl: '',
      fileName: '',
      fileSize: 0,
    });
    this.triggerFormTick();
  }

  /** Remove content item audio */
  removeContentItemAudio(sectionIdx: number, lectureIdx: number, contentItemIdx: number): void {
    if (this.isBrowser() && !confirm('آیا از حذف این فایل صوتی مطمئن هستید؟')) return;
    const contentItem = this.getContentItems(sectionIdx, lectureIdx).at(contentItemIdx) as FormGroup;
    contentItem.patchValue({
      audioUrl: '',
      audioFileName: '',
      audioFileSize: 0,
      audioDuration: 0,
    });
    this.triggerFormTick();
  }

  /** Get content item icon based on type */
  getContentItemIcon(type: string): string {
    switch (type) {
      case 'video':
        return 'play_circle';
      case 'rich-text':
        return 'article';
      case 'attachment':
        return 'insert_drive_file';
      case 'external-link':
        return 'link';
      case 'image':
        return 'image';
      case 'audio':
        return 'audiotrack';
      default:
        return 'play_circle';
    }
  }

  /** Get content item type label in Persian */
  getContentItemTypeLabel(type: string): string {
    switch (type) {
      case 'video':
        return 'ویدیو';
      case 'rich-text':
        return 'متن غنی';
      case 'attachment':
        return 'فایل ضمیمه';
      case 'external-link':
        return 'لینک خارجی';
      case 'image':
        return 'تصویر';
      case 'audio':
        return 'فایل صوتی';
      default:
        return 'نامشخص';
    }
  }

  private setLectureUploadProgress(key: string, progress: number): void {
    const current = { ...this.lectureUploadProgress() };
    current[key] = progress;
    this.lectureUploadProgress.set(current);
  }

  private setLectureUploadStatus(
    key: string,
    status: 'idle' | 'uploading' | 'success' | 'error'
  ): void {
    const current = { ...this.lectureUploadStatus() };
    current[key] = status;
    this.lectureUploadStatus.set(current);
  }

  private clearLectureUploadState(key: string): void {
    const progress = { ...this.lectureUploadProgress() };
    delete progress[key];
    this.lectureUploadProgress.set(progress);

    const status = { ...this.lectureUploadStatus() };
    delete status[key];
    this.lectureUploadStatus.set(status);
  }

  getLectureUploadProgress(
    sectionIdx: number,
    lectureIdx: number,
    type: 'video' | 'file'
  ): number {
    return (
      this.lectureUploadProgress()[`${sectionIdx}-${lectureIdx}-${type}`] || 0
    );
  }

  getLectureUploadStatus(
    sectionIdx: number,
    lectureIdx: number,
    type: 'video' | 'file'
  ): string {
    return (
      this.lectureUploadStatus()[`${sectionIdx}-${lectureIdx}-${type}`] || 'idle'
    );
  }

  // Content item upload progress methods
  getContentItemUploadProgress(
    sectionIdx: number,
    lectureIdx: number,
    contentItemIdx: number,
    type: 'video' | 'file' | 'image' | 'audio'
  ): number {
    return (
      this.lectureUploadProgress()[`${sectionIdx}-${lectureIdx}-${contentItemIdx}-${type}`] || 0
    );
  }

  getContentItemUploadStatus(
    sectionIdx: number,
    lectureIdx: number,
    contentItemIdx: number,
    type: 'video' | 'file' | 'image' | 'audio'
  ): string {
    return (
      this.lectureUploadStatus()[`${sectionIdx}-${lectureIdx}-${contentItemIdx}-${type}`] || 'idle'
    );
  }

  formatFileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024)
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  goToStep(step: number): void {
    if (step < this.currentStep()) {
      this.currentStep.set(step);
      this.scrollToTop();
      return;
    }

    if (this.currentStep() === 1 && !this.basicForm.valid) {
      this.basicForm.markAllAsTouched();
      this.showToast('لطفاً اطلاعات پایه الزامی را کامل کنید', 'error');
      return;
    }

    if (this.currentStep() === 3 && !this.isFreeCourse()) {
      const price = this.parseNumber(this.pricingForm.get('price')?.value) || 0;
      if (price <= 0) {
        this.showToast(
          'برای دوره غیر رایگان، قیمت دوره باید بیشتر از صفر باشد',
          'error'
        );
        return;
      }
    }

    if (this.currentStep() === 4 && this.sections.length === 0) {
      this.showToast('سرفصل دوره باید حداقل دارای یک فصل باشد', 'error');
      return;
    }

    this.currentStep.set(step);
    this.scrollToTop();
  }

  nextStep(): void {
    if (this.currentStep() < this.steps.length)
      this.goToStep(this.currentStep() + 1);
  }
  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    if (this.isBrowser() && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    if (type === 'success') {
      this.successMessage.set(message);
      setTimeout(() => this.successMessage.set(''), 4000);
    } else {
      this.errorMessage.set(message);
      setTimeout(() => this.errorMessage.set(''), 6000);
    }
  }

  private handleApiError(err: any, fallbackMessage: string): void {
    let msg = fallbackMessage;
    if (
      err?.error?.errors &&
      Array.isArray(err.error.errors) &&
      err.error.errors.length > 0
    ) {
      const firstErr = err.error.errors[0];
      msg = `${firstErr.msg || firstErr.message || fallbackMessage} (${
        firstErr.path || firstErr.param || ''
      })`;
    } else if (err?.error?.message) {
      msg = err.error.message;
    } else if (err?.message) {
      msg = err.message;
    }
    this.showToast(msg, 'error');
  }


  formatDuration(seconds: number): string {
    const total = Math.floor(Number(seconds) || 0);
    if (total <= 0) return '۰ ثانیه';

    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    const parts: string[] = [];
    if (h > 0) parts.push(`${this.faNum(h)} ساعت`);
    if (m > 0) parts.push(`${this.faNum(m)} دقیقه`);
    if (s > 0) parts.push(`${this.faNum(s)} ثانیه`);
    return parts.length ? parts.join(' و ') : `${h} ساعت`;
  }

  formatLastSaved(): string {
    const d = this.lastSaved();
    if (!d) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'همین الان';
    if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
    return d.toLocaleTimeString('fa-IR');
  }

  getLectureIcon(type: string): string {
    switch (type) {
      case 'video':
        return 'play_circle';
      case 'quiz':
        return 'quiz';
      case 'article':
        return 'article';
      case 'download':
        return 'download';
      case 'live':
        return 'videocam';
      default:
        return 'play_circle';
    }
  }

  getDiscountPercent(): number {
    const price = this.parseNumber(this.pricingForm.get('price')?.value) || 0;
    const discount =
      this.parseNumber(this.pricingForm.get('discountPrice')?.value) || 0;
    if (!price || !discount || discount >= price) return 0;
    return Math.round(((price - discount) / price) * 100);
  }

  getCountdownPreviewPercent(): number {
    const initial = Number(this.pricingForm.get('cdInitialPercent')?.value) || 0;
    const final = Number(this.pricingForm.get('cdFinalPercent')?.value) || 0;
    if (initial <= final) return 0;
    return (initial + final) / 2;
  }

  private combineDateAndTime(dateObj: any, timeStr: string): string | undefined {
    if (!dateObj) return undefined;
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) return undefined;
    const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
    d.setHours(hh || 0, mm || 0, 0, 0);
    return d.toISOString();
  }

  openPreview(): void {
    this.showPreviewModal.set(true);
  }
  closePreview(): void {
    this.showPreviewModal.set(false);
  }

  getStepProgress(stepId: number): number {
    switch (stepId) {
      case 1:
        return this.basicProgress();
      case 2:
        return this.mediaProgress();
      case 3:
        return this.pricingProgress();
      case 4:
        return this.curriculumProgress();
      case 5:
        return this.seoProgress();
      default:
        return 0;
    }
  }

  trackByStepId(index: number, step: Step): number {
    return step.id;
  }

  private firstValueFromWithTimeout<T>(source: Observable<T>): Promise<T> {
    return firstValueFrom(source.pipe(timeout(30000)));
  }

  private async syncSectionsAndLectures(courseId: string): Promise<void> {
    const freeCourse = this.isFreeCourse();

    let existingSections: any[] = [];
    try {
      const res = await this.firstValueFromWithTimeout(this.sectionService.getSections(courseId));
      existingSections = res.data || [];
    } catch (error) { throw error; }

    const existingByOrder = new Map<number, any>();
    existingSections.forEach((s: any) => existingByOrder.set(s.order, s));

    const formSections = this.sections.controls;
    const existingSectionOrders = new Set<number>();

    for (let secIdx = 0; secIdx < formSections.length; secIdx++) {
      const sec = formSections[secIdx];
      const secTitle = sec.get('title')?.value?.trim() || `فصل ${secIdx + 1}`;
      const secDesc = sec.get('description')?.value?.trim() || '';

      let serverSection = existingByOrder.get(secIdx);
      if (serverSection) {
        if (
          serverSection.title !== secTitle ||
          serverSection.description !== secDesc
        ) {
          try {
            await this.firstValueFromWithTimeout(
              this.sectionService.updateSection(courseId, serverSection._id, {
                title: secTitle,
                description: secDesc,
              })
            );
          } catch (e) {
            console.warn('Section update failed:', e);
            throw e;
          }
        }
      } else {
        try {
          const res = await this.firstValueFromWithTimeout(
            this.sectionService.createSection(courseId, {
              title: secTitle,
              description: secDesc,
            })
          );
          serverSection = res.data;
        } catch (e) {
          console.warn('Section create failed:', e);
          throw e;
        }
      }
      if (!serverSection) throw new Error('پاسخ ساخت فصل معتبر نیست');
      existingSectionOrders.add(secIdx);

      const lecturesControl = sec.get('lectures');
      const lecturesArray =
        lecturesControl instanceof FormArray ? lecturesControl.controls : [];
      if (!lecturesArray || lecturesArray.length === 0) continue;

      let existingLectures: any[] = [];
      try {
        const res = await this.firstValueFromWithTimeout(
          this.lectureService.getLectures(courseId, serverSection._id)
        );
        existingLectures = res.data || [];
      } catch (error) { throw error; }

      const existingLecturesByOrder = new Map<number, any>();
      existingLectures.forEach((l: any) =>
        existingLecturesByOrder.set(l.order, l)
      );
      const existingLectureOrders = new Set<number>();

      for (let lecIdx = 0; lecIdx < lecturesArray.length; lecIdx++) {
        const lec = lecturesArray[lecIdx] as FormGroup;
        const lecTitle = lec.get('title')?.value?.trim() || `درس ${lecIdx + 1}`;

        let serverLecture = existingLecturesByOrder.get(lecIdx);
        const lectureData = {
          title: lecTitle,
          type: lec.get('type')?.value || 'video',
          duration: (Number(lec.get('duration')?.value) || 0) * 60,
          isFreePreview: freeCourse
            ? true
            : Boolean(lec.get('isFreePreview')?.value),
          isLocked: freeCourse ? false : !Boolean(lec.get('isFreePreview')?.value),
          content: lec.get('content')?.value || '',
          videoUrl: lec.get('videoUrl')?.value || '',
          videoFileName: lec.get('videoFileName')?.value || '',
          videoFileSize: Number(lec.get('videoFileSize')?.value) || 0,
          fileUrl: lec.get('fileUrl')?.value || '',
          fileName: lec.get('fileName')?.value || '',
          fileSize: Number(lec.get('fileSize')?.value) || 0,
          order: lecIdx,
          // ✅ NEW: Include content items in lecture data for backend sync
          contentItems: this.getContentItemsForSync(secIdx, lecIdx),
        };

        if (serverLecture) {
          try {
            await this.firstValueFromWithTimeout(
              this.lectureService.updateLecture(
                courseId,
                serverSection._id,
                serverLecture._id,
                lectureData
              )
            );
          } catch (e) {
            console.warn('Lecture update failed:', e);
            throw e;
          }
        } else {
          try {
            const res = await this.firstValueFromWithTimeout(
              this.lectureService.createLecture(
                courseId,
                serverSection._id,
                lectureData
              )
            );
            serverLecture = res.data;
          } catch (e) {
            console.warn('Lecture create failed:', e);
            throw e;
          }
        }
        if (!serverLecture) throw new Error('پاسخ ساخت جلسه معتبر نیست');
        existingLectureOrders.add(lecIdx);

        // Sync content items for this lecture
        if (serverLecture) {
          await this.syncContentItems(courseId, serverSection._id, serverLecture._id, lec, lecIdx);
        }
      }

      for (const existingLec of existingLectures) {
        if (!existingLectureOrders.has(existingLec.order)) {
          try {
            await this.firstValueFromWithTimeout(
              this.lectureService.deleteLecture(
                courseId,
                serverSection._id,
                existingLec._id
              )
            );
          } catch (e) {
            console.warn('Lecture delete failed:', e);
          throw e;
          }
        }
      }
    }

    for (let i = existingSections.length - 1; i >= 0; i--) {
      if (!existingSectionOrders.has(existingSections[i].order)) {
        try {
          await this.firstValueFromWithTimeout(
            this.sectionService.deleteSection(courseId, existingSections[i]._id)
          );
        } catch (e) {
          console.warn('Section delete failed:', e);
          throw e;
        }
      }
    }
  }

  /**
   * Sync content items for a lecture
   */
  private async syncContentItems(
    courseId: string,
    sectionId: string,
    lectureId: string,
    lectureForm: FormGroup,
    lectureIndex: number
  ): Promise<void> {
    const contentItemsControl = lectureForm.get('contentItems');
    const contentItemsArray = contentItemsControl instanceof FormArray ? contentItemsControl.controls : [];
    if (!contentItemsArray || contentItemsArray.length === 0) return;

    // Get existing content items from server
    let existingContentItems: any[] = [];
    try {
      // We'll need to fetch the lecture to get its content items
      const lectureRes = await this.firstValueFromWithTimeout(
        this.lectureService.getLectures(courseId, sectionId)
      );
      const lecture = lectureRes.data?.find((l: any) => l._id === lectureId);
      if (lecture) {
        existingContentItems = lecture.contentItems || [];
      }
    } catch (error) { throw error; }

    const existingByOrder = new Map<number, any>();
    existingContentItems.forEach((item: any) => existingByOrder.set(item.order, item));
    const existingContentItemOrders = new Set<number>();

    for (let ciIdx = 0; ciIdx < contentItemsArray.length; ciIdx++) {
      const item = contentItemsArray[ciIdx] as FormGroup;
      const itemTitle = item.get('title')?.value?.trim() || `محتوا ${ciIdx + 1}`;
      const itemType = item.get('type')?.value || 'video';

      let serverItem = existingByOrder.get(ciIdx);
      const itemData = {
        _id: serverItem?._id || undefined,
        type: itemType,
        title: itemTitle,
        description: item.get('description')?.value?.trim() || '',
        order: ciIdx,
        // Video specific
        videoUrl: item.get('videoUrl')?.value || '',
        videoFileName: item.get('videoFileName')?.value || '',
        videoFileSize: Number(item.get('videoFileSize')?.value) || 0,
        videoDuration: Number(item.get('videoDuration')?.value) || 0,
        // Rich text specific
        richTextContent: item.get('richTextContent')?.value || '',
        // Attachment specific
        fileUrl: item.get('fileUrl')?.value || '',
        fileName: item.get('fileName')?.value || '',
        fileSize: Number(item.get('fileSize')?.value) || 0,
        fileType: item.get('fileType')?.value || '',
        // External link specific
        externalUrl: item.get('externalUrl')?.value || '',
        // Image specific
        imageUrl: item.get('imageUrl')?.value || '',
        // Audio specific
        audioUrl: item.get('audioUrl')?.value || '',
        audioFileName: item.get('audioFileName')?.value || '',
        audioFileSize: Number(item.get('audioFileSize')?.value) || 0,
        audioDuration: Number(item.get('audioDuration')?.value) || 0,
      };

      if (serverItem) {
        try {
          await this.firstValueFromWithTimeout(
            this.lectureService.updateContentItem(
              courseId,
              sectionId,
              lectureId,
              serverItem._id,
              itemData
            )
          );
        } catch (e) {
          console.warn('Content item update failed:', e);
          throw e;
        }
      } else {
        try {
          const res = await this.firstValueFromWithTimeout(
            this.lectureService.addContentItem(
              courseId,
              sectionId,
              lectureId,
              itemData
            )
          );
          serverItem = res.data;
        } catch (e) {
          console.warn('Content item create failed:', e);
          throw e;
        }
      }
      existingContentItemOrders.add(ciIdx);
    }

    // Delete content items that are no longer in the form
    for (const existingItem of existingContentItems) {
      if (!existingContentItemOrders.has(existingItem.order)) {
        try {
          await this.firstValueFromWithTimeout(
            this.lectureService.deleteContentItem(
              courseId,
              sectionId,
              lectureId,
              existingItem._id
            )
          );
        } catch (e) {
          console.warn('Content item delete failed:', e);
          throw e;
        }
      }
    }
  }

  private assemblePayload(): any {
    const basicValues = { ...this.basicForm.value };
    const pricingValues = { ...this.pricingForm.value };
    const seoVals = { ...this.seoForm.value };

    let desc = basicValues.description?.trim() || '';
    if (desc.length > 0 && desc.length < 100) {
      desc =
        desc +
        ' - توضیحات تکمیلی دوره آموزشی جهت ثبت اولیه و امکان ویرایش مجدد توسط مدرس دوره.';
    } else if (!desc) {
      desc =
        'توضیحات اولیه دوره آموزشی جهت ثبت پیش‌نویس و ویرایش کامل در مراحل بعدی ثبت دوره.';
    }

    const shortDesc =
      basicValues.shortDescription?.trim() || 'توضیح کوتاه دوره آموزشی';

    let discountEndsAt: string | null = null;
    if (pricingValues.discountEndDate) {
      const d = new Date(pricingValues.discountEndDate);
      if (!isNaN(d.getTime())) {
        discountEndsAt = d.toISOString();
      }
    }

    const isFree = Boolean(pricingValues.isFree);
    const parsedPrice = this.parseNumber(pricingValues.price) || 0;
    const parsedDiscount = this.parseNumber(pricingValues.discountPrice);
    const parsedMaxStudents = this.parseNumber(pricingValues.maxStudents);
    const discountType = isFree ? 'none' : pricingValues.discountType || 'none';

    const payload: any = {
      title: basicValues.title?.trim() || 'عنوان پیش‌فرض دوره',
      subtitle: basicValues.subtitle?.trim() || '',
      description: desc,
      shortDescription: shortDesc,
      category: basicValues.category || undefined,
      subCategory: basicValues.subcategory || undefined,
      level: basicValues.level || 'all-levels',
      language: basicValues.language || 'fa',

      isFree: isFree,
      price: isFree ? 0 : parsedPrice,
      discountType: discountType,

      isFullyAccessible: isFree ? true : false,
      allLecturesFree: isFree ? true : false,

      discountPrice:
        !isFree && discountType === 'manual' && parsedDiscount && parsedDiscount > 0
          ? parsedDiscount
          : null,
      discountEndsAt:
        !isFree && discountType === 'manual' && discountEndsAt
          ? discountEndsAt
          : null,

      countdownDiscount:
        !isFree && discountType === 'countdown'
          ? {
              enabled: true,
              startAt: this.combineDateAndTime(
                pricingValues.cdStartDate,
                pricingValues.cdStartTime
              ),
              endAt: this.combineDateAndTime(
                pricingValues.cdEndDate,
                pricingValues.cdEndTime
              ),
              initialPercent: Number(pricingValues.cdInitialPercent) || 100,
              finalPercent: Number(pricingValues.cdFinalPercent) || 0,
              mode: pricingValues.cdMode || 'linear',
              stepIntervalMinutes:
                pricingValues.cdMode === 'step'
                  ? Number(pricingValues.cdStepInterval) || 30
                  : undefined,
              stepPercent:
                pricingValues.cdMode === 'step'
                  ? Number(pricingValues.cdStepPercent) || 10
                  : undefined,
            }
          : null,

      hasCertificate: Boolean(pricingValues.hasCertificate),
      hasLifetimeAccess: isFree
        ? true
        : Boolean(pricingValues.hasLifetimeAccess),
      hasSupport: Boolean(pricingValues.hasSupport),
      maxStudents: isFree ? null : parsedMaxStudents || null,
      installmentEnabled: isFree
        ? false
        : Boolean(pricingValues.installmentEnabled),
      installmentCount: Number(String(pricingValues.installmentCount)) || 3,
      requirements: this.requirements.value.filter((r: string) => r?.trim()),
      requirementCourses: this.buildRequirementCourses(),
      learningOutcomes: this.learningOutcomes.value.filter((o: string) =>
        o?.trim()
      ),
      targetAudience: this.targetAudience.value.filter((a: string) => a?.trim()),
      tags: this.tags.value.filter((t: string) => t?.trim()),
      thumbnail: (() => {
        const t = this.thumbnailPreview();
        if (!t || t.startsWith('data:')) return undefined;
        return t;
      })(),
      promoVideo: this.promoVideoPreview() || undefined,
      promoVideoType: this.mediaForm.get('promoVideoType')?.value || 'upload',
      promoVideoUrl: this.mediaForm.get('promoVideoUrl')?.value || undefined,
      metaTitle: (seoVals.metaTitle || basicValues.title || '').substring(0, 60),
      metaDescription: (seoVals.metaDescription || basicValues.shortDescription || '').replace(/<[^>]*>/g, '').substring(0, 200),
      keywords: this.keywords.value.filter((k: string) => k?.trim()),
      // ✅ NEW: Include sections with lectures and content items
      sections: this.sections.controls.map((sec, secIdx) => ({
        title: sec.get('title')?.value?.trim() || `فصل ${secIdx + 1}`,
        description: sec.get('description')?.value?.trim() || '',
        lectures: this.getLectures(secIdx).controls.map((lec, lecIdx) => ({
          title: lec.get('title')?.value?.trim() || `درس ${lecIdx + 1}`,
          type: lec.get('type')?.value || 'video',
          duration: (Number(lec.get('duration')?.value) || 0) * 60,
          isFreePreview: this.isFreeCourse() ? true : Boolean(lec.get('isFreePreview')?.value),
          content: lec.get('content')?.value || '',
          videoUrl: lec.get('videoUrl')?.value || '',
          videoFileName: lec.get('videoFileName')?.value || '',
          videoFileSize: Number(lec.get('videoFileSize')?.value) || 0,
          fileUrl: lec.get('fileUrl')?.value || '',
          fileName: lec.get('fileName')?.value || '',
          fileSize: Number(lec.get('fileSize')?.value) || 0,
          order: lecIdx,
          contentItems: this.getContentItemsForSync(secIdx, lecIdx),
        })),
      })),
    };

    return this.cleanPayload(payload);
  }

  private cleanPayload(obj: any): any {
    const cleaned: any = {};
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (value === undefined) return;
      if (typeof value === 'string' && value.trim() === '') return;
      if (Array.isArray(value) && value.length === 0) return;
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        return;
      }
      cleaned[key] = value;
    });
    return cleaned;
  }

  private assembleMinimalPayload(): any {
    const title = this.basicForm.get('title')?.value?.trim() || 'دوره جدید';
    let desc = this.basicForm.get('description')?.value?.trim() || '';
    if (desc.length < 100) {
      desc =
        desc +
        ' - ' +
        'توضیحات اولیه دوره جهت ثبت پیش‌نویس. این متن پس از تکمیل توسط مدرس ویرایش خواهد شد.'.repeat(
          2
        );
    }
    const shortDesc =
      this.basicForm.get('shortDescription')?.value?.trim() ||
      desc.substring(0, 200);

    const minimal: any = {
      title,
      description: desc,
      shortDescription: shortDesc,
      level: this.basicForm.get('level')?.value || 'all-levels',
      language: this.basicForm.get('language')?.value || 'fa',
      slug: this.generateSlug(title) || `course-${Date.now()}`,
    };

    const category = this.basicForm.get('category')?.value;
    if (category) minimal.category = category;

    const subcategory = this.basicForm.get('subcategory')?.value;
    if (subcategory) minimal.subCategory = subcategory;

    return minimal;
  }

  // ═══════════════════════════════════════════
  // ✅ NEW: متدهای انتساب دوره به مسیر یادگیری
  // ═══════════════════════════════════════════

  /** تشخیص ادمین بودن */
  get isAdminUser(): boolean {
    return this.authService.isAdmin();
  }

  /** تغییر حالت انتساب مسیر */
  setLearningPathMode(mode: 'none' | 'existing' | 'new'): void {
    this.learningPathMode.set(mode);
    if (mode === 'none') {
      this.selectedPath.set(null);
      this.selectedStageId.set(null);
      this.pathSearchResults.set([]);
      this.pathSearchQuery.set('');
    }
    if (mode === 'existing') {
      this.searchPaths('');
    }
  }

  /** جستجوی مسیرها با debounce */
  private searchDebounceTimer: any;
  searchPaths(query: string): void {
    this.pathSearchQuery.set(query);
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.pathSearchLoading.set(true);
      this.lpService.searchForAssignment(query).subscribe({
        next: (res: any) => {
          this.pathSearchResults.set(res.data || []);
          this.pathSearchLoading.set(false);
        },
        error: () => {
          this.pathSearchResults.set([]);
          this.pathSearchLoading.set(false);
        },
      });
    }, 300);
  }

  /** انتخاب یک مسیر → لود جزئیات مراحل */
  selectPath(path: LearningPathSummary): void {
    this.pathSearchResults.set([]);
    this.pathSearchQuery.set(path.title);
    this.selectedStageId.set(null);

    this.lpService.getDetailsForAssignment(path._id).subscribe({
      next: (res: any) => {
        this.selectedPath.set(res.data);
        // جمع‌آوری دوره‌های موجود در مسیر برای تشخیص تکرار
        const allCourses: any[] = [];
        (res.data?.stages || []).forEach((stage: any) => {
          (stage.courses || []).forEach((cn: any) => {
            allCourses.push(cn.course);
          });
        });
        this.existingPathCourses.set(allCourses);
      },
      error: () => {
        this.showToast('خطا در بارگذاری جزئیات مسیر', 'error');
      },
    });
  }

  /** انتخاب مرحله مقصد */
  selectStage(stageId: string): void {
    this.selectedStageId.set(stageId);
  }

  /** بررسی تکراری بودن دوره در مسیر انتخاب‌شده */
  isCourseInPath(): boolean {
    const cid = this.courseId();
    if (!cid) return false;
    return this.existingPathCourses().some(
      (c: any) => (c?._id || c) === cid
    );
  }

  /** آیا دوره در مرحله انتخاب‌شده وجود دارد؟ */
  isCourseInSelectedStage(): boolean {
    const cid = this.courseId();
    if (!cid || !this.selectedPath() || !this.selectedStageId()) return false;
    const stage = this.selectedPath()?.stages?.find(
      (s) => s._id === this.selectedStageId()
    );
    if (!stage) return false;
    return stage.courses.some((cn) => (cn.course?._id || cn.course) === cid);
  }

  /** دریافت دوره‌های مرحله انتخاب‌شده (برای پیش‌نیاز) */
  getCoursesInSelectedStage(): any[] {
    const path = this.selectedPath();
    const stageId = this.selectedStageId();
    if (!path || !stageId) return [];
    const stage = path.stages?.find((s) => s._id === stageId);
    return stage?.courses || [];
  }

  /** بروزرسانی فیلد خاصی از تنظیمات دوره در مسیر */
  updateCourseInPathSetting(field: string, value: any): void {
    this.courseInPathSettings.update((s) => ({ ...s, [field]: value }));
  }

  /** آیا فرم انتساب معتبر است؟ */
  isPathAssignmentValid(): boolean {
    if (this.learningPathMode() === 'none') return true;
    if (this.learningPathMode() === 'existing') {
      return !!(this.selectedPath()?._id && this.selectedStageId());
    }
    if (this.learningPathMode() === 'new') {
      return !!(this.newPathTitle() && this.newFirstStageTitle());
    }
    return false;
  }

  /** انتساب دوره به مسیر موجود */
  private async assignCourseToExistingPath(courseId: string): Promise<void> {
    const pathId = this.selectedPath()?._id;
    const stageId = this.selectedStageId();
    const settings = this.courseInPathSettings();
    if (!pathId || !stageId) return;

    // بررسی تکراری
    if (this.isCourseInSelectedStage()) {
      this.showToast('⚠️ این دوره قبلاً در این مرحله اضافه شده است', 'error');
      return;
    }

    const payload = {
      courseId,
      isRequired: settings.isRequired,
      prerequisites: settings.prerequisites,
      estimatedDuration: settings.estimatedDuration || 0,
      customTitle: settings.customTitle || undefined,
      customDescription: settings.customDescription || undefined,
    };

    return new Promise((resolve, reject) => {
      this.lpService.addCourseToStage(pathId, stageId, payload).subscribe({
        next: () => {
          // ✅ به‌روزرسانی UI: علامت‌گذاری دوره به‌عنوان اضافه‌شده
          this.existingPathCourses.update((courses) => [...courses, { _id: courseId } as any]);

          this.showToast(
            `✅ دوره به مسیر «${this.selectedPath()?.title}» اضافه شد`,
            'success'
          );
          resolve();
        },
        error: (err) => {
          const msg = err?.error?.message || 'خطا در انتساب دوره به مسیر';
          this.showToast(msg, 'error');
          reject(err);
        },
      });
    });
  }

  /** ساخت مسیر جدید + انتساب دوره */
  private async createPathAndAssignCourse(courseId: string): Promise<void> {
    const payload: any = {
      title: this.newPathTitle(),
      subtitle: this.newPathSubtitle(),
      icon: this.newPathIcon(),
      difficulty: this.newPathDifficulty(),
      shortDescription: this.newPathShortDesc(),
      description: this.newPathDesc(),
      courseId,
      firstStage: {
        title: this.newFirstStageTitle(),
        description: this.newFirstStageDesc(),
        icon: this.newFirstStageIcon(),
        color: this.newFirstStageColor(),
      },
      courseSettings: this.courseInPathSettings(),
    };

    // اضافه کردن category اگر انتخاب شده
    const cat = this.basicForm.get('category')?.value;
    if (cat) payload.category = cat;

    return new Promise((resolve, reject) => {
      this.lpService.quickCreatePath(payload).subscribe({
        next: (res: any) => {
          // ✅ به‌روزرسانی UI با مسیر ساخته‌شده
          if (res.data) {
            const newPath = res.data;
            this.learningPathMode.set('existing');
            this.pathSearchQuery.set(newPath.title || this.newPathTitle());

            const simulatedPath: LearningPathDetailForAssignment = {
              _id: newPath._id,
              title: newPath.title || this.newPathTitle(),
              icon: newPath.icon || this.newPathIcon(),
              status: newPath.status || 'draft',
              stages: newPath.stages?.length > 0
                ? newPath.stages.map((s: any) => ({
                    _id: s._id,
                    title: s.title,
                    icon: s.icon || '📚',
                    color: s.color || '#a435f0',
                    order: s.order || 0,
                    courses: s.courses || [],
                  }))
                : [
                    {
                      _id: '',
                      title: this.newFirstStageTitle(),
                      icon: this.newFirstStageIcon(),
                      color: this.newFirstStageColor(),
                      order: 0,
                      courses: [{ course: { _id: courseId } as any, order: 0 } as any],
                    },
                  ],
            };
            this.selectedPath.set(simulatedPath);
            if (simulatedPath.stages.length > 0 && simulatedPath.stages[0]._id) {
              this.selectedStageId.set(simulatedPath.stages[0]._id);
            }
          }

          this.showToast(
            `✅ مسیر «${res.data?.title || this.newPathTitle()}» ساخته شد و دوره به مرحله اول اضافه شد`,
            'success'
          );
          resolve();
        },
        error: (err) => {
          const msg = err?.error?.message || 'خطا در ساخت مسیر یادگیری';
          this.showToast(msg, 'error');
          reject(err);
        },
      });
    });
  }

  /** بارگذاری مسیرهای مرتبط با دوره (در حالت ویرایش) */
  loadExistingPathAssignment(): void {
    const cid = this.courseId();
    if (!cid) return;

    this.lpService.getLearningPathsWithCourse(cid).subscribe({
      next: (res: any) => {
        const paths = res.data || [];
        if (paths.length > 0) {
          const firstPath = paths[0];
          // ✅ به‌روزرسانی UI: نمایش مسیر و مرحله انتخاب‌شده
          this.learningPathMode.set('existing');
          this.pathSearchQuery.set(firstPath.title);

          // شبیه‌سازی selectedPath با داده‌های موجود
          const simulatedPath: LearningPathDetailForAssignment = {
            _id: firstPath._id,
            title: firstPath.title,
            icon: firstPath.icon || '📚',
            status: firstPath.status,
            stages: firstPath.stage
              ? [
                  {
                    _id: firstPath.stage._id,
                    title: firstPath.stage.title,
                    icon: firstPath.stage.icon || '📚',
                    color: firstPath.stage.color || '#a435f0',
                    courses: firstPath.stage.courses || [],
                    order: firstPath.stage.order || 0,
                  },
                ]
              : [],
          };
          this.selectedPath.set(simulatedPath);
          if (firstPath.stage?._id) {
            this.selectedStageId.set(firstPath.stage._id);
          }

          this.showToast(
            `ℹ️ این دوره در مسیر «${firstPath.title}» (مرحله: ${firstPath.stage?.title || '-'}) موجود است`,
            'success'
          );
        }
      },
      error: () => {
        // خطا نادیده گرفته شود — فقط اطلاع‌رسانی
      },
    });
  }

  saveDraft(): void {
    if (this.isSaving() || this.isAutoSaving()) return;
    if (this.showRecoveryBanner()) { this.showToast('ابتدا پیش‌نویس قبلی را بازیابی یا رد کنید.', 'error'); return; }
    if (!this.basicForm.get('title')?.value?.trim()) {
      this.showToast('لطفاً حداقل عنوان دوره را وارد کنید', 'error');
      return;
    }

    if (this.isFreeCourse()) this.unlockAllLectures();

    this.saveDraftToLocalStorage();
    const snapshot = this.draftSnapshot();
    this.isSaving.set(true);
    const payload = this.assemblePayload();

    const handleSuccess = async (res: any) => {
      if (res.success && res.data) {
        const cid = res.data._id || this.courseId();
        this.courseId.set(cid);
        this.isEditMode = true;
        this.saveDraftToLocalStorage();
        try {
          await this.syncSectionsAndLectures(cid);
        } catch (e) {
          console.warn('Section sync warning:', e);
          this.saveDraftToLocalStorage();
          this.isSaving.set(false);
          this.showToast('ذخیره سرفصل‌ها کامل نشد؛ نسخه محلی حفظ شد.', 'error');
          return;
        }

        // ✅ NEW: انتساب دوره به مسیر یادگیری (فقط ادمین)
        let pathAssignmentOk = false;
        if (this.isAdminUser && this.learningPathMode() !== 'none' && cid) {
          if (this.isPathAssignmentValid()) {
            try {
              if (this.learningPathMode() === 'existing') {
                await this.assignCourseToExistingPath(cid);
              } else if (this.learningPathMode() === 'new') {
                await this.createPathAndAssignCourse(cid);
              }
              pathAssignmentOk = true;
            } catch (pathErr) {
              console.warn('Path assignment after save failed:', pathErr);
            }
          } else {
            this.showToast('⚠️ اطلاعات مسیر یادگیری ناقص است — فقط دوره ذخیره شد', 'error');
          }
        }

        this.lastSaved.set(new Date());
        if (!this.isAdminUser || this.learningPathMode() === 'none' || pathAssignmentOk || !this.isPathAssignmentValid()) {
          this.showToast('✅ پیش‌نویس با موفقیت ذخیره شد', 'success');
        }
        this.markSavedIfUnchanged(snapshot);
      }
      this.isSaving.set(false);
    };

    const handleError = (err: any) => {
      this.isSaving.set(false);
      this.handleApiError(err, 'خطایی در ذخیره پیش‌نویس پیش آمد');
    };

    if (this.isEditMode && this.courseId()) {
      this.api.put<any>(`/courses/${this.courseId()}`, payload).pipe(timeout(30000)).subscribe({
        next: handleSuccess,
        error: handleError,
      });
    } else {
      this.api.post<any>('/courses', payload).pipe(timeout(30000)).subscribe({
        next: handleSuccess,
        error: handleError,
      });
    }
  }

  submitForReview(): void {
    if (this.isSaving() || this.isAutoSaving()) return;
    if (this.showRecoveryBanner()) { this.showToast('ابتدا پیش‌نویس قبلی را بازیابی یا رد کنید.', 'error'); return; }
    if (this.sections.length === 0) {
      this.showToast('دوره باید حداقل دارای یک فصل آموزشی باشد', 'error');
      return;
    }
    if (this.totalLectures() === 0) {
      this.showToast('سرفصل‌های دوره باید حداقل دارای یک درس باشند', 'error');
      return;
    }
    if (!this.isFreeCourse()) {
      const price = this.parseNumber(this.pricingForm.get('price')?.value) || 0;
      if (price <= 0) {
        this.showToast(
          'قیمت دوره را مشخص کنید یا گزینه «دوره رایگان» را انتخاب نمایید',
          'error'
        );
        this.goToStep(3);
        return;
      }
    }
    if (this.overallProgress() < 70) {
      if (
        this.isBrowser() &&
        !confirm(
          'درصد تکمیل دوره زیر ۷۰٪ است. آیا از ارسال برای بازبینی مطمئن هستید؟'
        )
      )
        return;
    }

    if (this.isFreeCourse()) this.unlockAllLectures();

    this.saveDraftToLocalStorage();
    this.isSaving.set(true);
    const payload = this.assemblePayload();
    const save$ =
      this.isEditMode && this.courseId()
        ? this.api.put<any>(`/courses/${this.courseId()}`, payload)
        : this.api.post<any>('/courses', payload);

    save$.pipe(timeout(30000)).subscribe({
      next: async (saveRes) => {
        if (saveRes.success && saveRes.data) {
          const currentId = saveRes.data._id || this.courseId();
          this.courseId.set(currentId);
          this.isEditMode = true;
          this.saveDraftToLocalStorage();

          try {
            await this.syncSectionsAndLectures(currentId);
          } catch (e) {
            console.warn('Section sync before submit failed:', e);
            this.isSaving.set(false);
            this.showToast('ارسال متوقف شد؛ ذخیره سرفصل‌ها کامل نشد و نسخه محلی حفظ شد.', 'error');
            return;
          }

          // ✅ NEW: انتساب دوره به مسیر یادگیری قبل از submit (فقط ادمین)
          if (this.isAdminUser && this.learningPathMode() !== 'none' && currentId) {
            if (this.isPathAssignmentValid()) {
              try {
                if (this.learningPathMode() === 'existing') {
                  await this.assignCourseToExistingPath(currentId);
                } else if (this.learningPathMode() === 'new') {
                  await this.createPathAndAssignCourse(currentId);
                }
              } catch (pathErr) {
                console.warn('Path assignment before submit failed:', pathErr);
                this.showToast('⚠️ خطا در انتساب مسیر یادگیری — ارسال دوره ادامه می‌یابد', 'error');
              }
            } else {
              this.showToast('⚠️ اطلاعات مسیر یادگیری ناقص است — فقط دوره ارسال شد', 'error');
            }
          }

          this.api.post<any>(`/courses/${currentId}/submit`, {}).pipe(timeout(30000)).subscribe({
            next: () => {
              this.isSaving.set(false);
              // فقط برای مدرس پیام نمایش بده، نه برای ادمین
              if (!this.authService.isAdmin()) {
                this.showToast(
                  '🎉 دوره با موفقیت برای مدیر بازبینی ارسال شد',
                  'success'
                );
              }
              this.router.navigate(['/instructor/dashboard']);
            },
            error: (err) => {
              this.isSaving.set(false);
              this.handleApiError(err, 'خطا در ارسال برای بازبینی');
            },
          });
        } else {
          this.isSaving.set(false);
          this.showToast('ذخیره دوره کامل نشد؛ نسخه محلی حفظ شد.', 'error');
        }
      },
      error: (err) => {
        this.isSaving.set(false);
        this.handleApiError(err, 'خطا در ذخیره‌سازی اطلاعات دوره');
      },
    });
  }
}