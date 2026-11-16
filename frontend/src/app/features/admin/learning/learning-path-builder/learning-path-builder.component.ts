import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Subject,
  debounceTime,
  takeUntil,
  finalize,
  switchMap,
  of,
  Observable,
  tap,
  startWith,
  firstValueFrom,
} from 'rxjs';

import {
  LearningPathService,
  ILearningPath,
  IStage,
} from '../../../../services/learning-path.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiService } from '../../../../core/services/api.service';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';
import { FaNumPipe } from '../../../../shared/pipes/fa-num.pipe';
import { StageEditorComponent } from '../stage-editor/stage-editor.component';
import { CoursePickerDialogComponent } from '../course-picker-dialog/course-picker-dialog.component';
import { PathPreviewComponent } from '../path-preview/path-preview.component';
import { RichTextEditorComponent } from '../../../../shared/components/rich-text-editor/rich-text-editor.component';
import { MarkdownPipe } from '../../../../shared/pipes/markdown.pipe';

type BuilderStep = 'basics' | 'structure' | 'settings';
type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-learning-path-builder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    DurationPipe,
    FaNumPipe,
    RichTextEditorComponent,
    MarkdownPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './learning-path-builder.component.html',
  styleUrls: ['./learning-path-builder.component.scss'],
})
export class LearningPathBuilderComponent implements OnInit, OnDestroy {
  private lpService = inject(LearningPathService);
  private toast = inject(ToastService);
  private dialog = inject(MatDialog);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private destroy$ = new Subject<void>();

  readonly isEditMode = signal(false);
  readonly saving = signal(false);
  readonly saveState = signal<SaveState>('idle');
  readonly lastSavedAt = signal<Date | null>(null);
  readonly currentStep = signal<BuilderStep>('basics');
  readonly focusMode = signal(false);
  readonly initialLoading = signal(false);
  readonly uploadingCover = signal(false);

  private savedPathId: string | null = null;
  readonly status = signal<'draft' | 'published'>('draft');

  readonly steps = [
    { id: 'basics' as BuilderStep, label: 'اطلاعات پایه', icon: 'info', desc: 'عنوان و مشخصات' },
    { id: 'structure' as BuilderStep, label: 'ساختار مسیر', icon: 'route', desc: 'مراحل و دوره‌ها' },
    { id: 'settings' as BuilderStep, label: 'تنظیمات و انتشار', icon: 'tune', desc: 'جزئیات نهایی' },
  ];

  readonly quickEmojis = ['🛤️', '🎯', '🚀', '📚', '💻', '🎨', '⚡', '🌟', '🔥', '💡'];
  readonly galleryCovers = [
    '/assets/covers/dunes.svg',
    '/assets/covers/topo.svg',
    '/assets/covers/islands.svg',
    '/assets/covers/neon.svg',
    '/assets/covers/papercut.svg',
    '/assets/covers/bauhaus.svg',
  ];

  readonly difficultyMeta: Record<string, { label: string; desc: string; color: string }> = {
    beginner: { label: 'مبتدی', desc: 'بدون نیاز به تجربه قبلی', color: '#4e9f3d' },
    intermediate: { label: 'متوسط', desc: 'نیاز به آشنایی اولیه', color: '#dd9a28' },
    advanced: { label: 'پیشرفته', desc: 'برای افراد با تجربه', color: '#d94f6a' },
    mixed: { label: 'ترکیبی', desc: 'شامل همه سطوح از صفر تا صد', color: '#6c5ce7' },
  };

  // Form Controls
  readonly titleControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly subtitleControl = new FormControl('', { nonNullable: true });
  readonly shortDescriptionControl = new FormControl('', { nonNullable: true });
  readonly descriptionControl = new FormControl('', { nonNullable: true });
  readonly iconControl = new FormControl('🛤️', { nonNullable: true });
  readonly difficultyControl = new FormControl<string>('mixed', { nonNullable: true });
  readonly categoryControl = new FormControl('', { nonNullable: true });
  readonly hasCertificateControl = new FormControl(false, { nonNullable: true });
  readonly certificateTitleControl = new FormControl('', { nonNullable: true });
  readonly isFeaturedControl = new FormControl(false, { nonNullable: true });
  readonly coverImage = signal('');

  // ✅ FIX #12: Convert FormControl values to signals for reactive computed
  readonly titleValue = toSignal(
    this.titleControl.valueChanges.pipe(startWith(this.titleControl.value)),
    { initialValue: '' },
  );
  readonly shortDescValue = toSignal(
    this.shortDescriptionControl.valueChanges.pipe(startWith(this.shortDescriptionControl.value)),
    { initialValue: '' },
  );
  readonly descriptionValue = toSignal(
    this.descriptionControl.valueChanges.pipe(startWith(this.descriptionControl.value)),
    { initialValue: '' },
  );

  readonly stages = signal<IStage[]>([]);
  readonly tags = signal<string[]>([]);
  readonly targetAudience = signal<string[]>([]);
  readonly learningOutcomes = signal<string[]>([]);
  readonly expandedStages = signal<Set<string>>(new Set());

  readonly showEmojiPicker = signal(false);
  readonly showCoverGallery = signal(false);
  readonly showMoreMenu = signal(false);
  readonly newTagInput = new FormControl('');
  readonly newAudienceInput = new FormControl('');
  readonly newOutcomeInput = new FormControl('');

  // Undo/Redo
  private history = { past: [] as string[], future: [] as string[] };
  readonly canUndo = computed(() => this.history.past.length > 0);
  readonly canRedo = computed(() => this.history.future.length > 0);

  // Computeds
  readonly totalCoursesCount = computed(() =>
    this.stages().reduce((sum, s) => sum + (s.courses?.length || 0), 0),
  );
  readonly requiredCoursesCount = computed(() =>
    this.stages().reduce((sum, s) => sum + (s.courses?.filter((c) => c.isRequired).length || 0), 0),
  );
  readonly estimatedDuration = computed(() =>
    this.stages().reduce(
      (sum, s) =>
        sum + (s.courses?.reduce((cSum, c) => cSum + (c.estimatedDuration || 0), 0) || 0),
      0,
    ),
  );

  // ✅ FIX #12: publishChecklist now uses signals — properly reactive
  readonly publishChecklist = computed(() => [
    {
      key: 'title',
      label: 'عنوان مسیر',
      passed: (this.titleValue() || '').trim().length > 0,
      step: 'basics' as BuilderStep,
    },
    {
      key: 'shortDesc',
      label: 'خلاصه کوتاه',
      passed: (this.shortDescValue() || '').trim().length > 0,
      step: 'basics' as BuilderStep,
    },
    {
      key: 'description',
      label: 'توضیحات کامل',
      passed: (this.descriptionValue() || '').trim().length > 0,
      step: 'basics' as BuilderStep,
    },
    {
      key: 'cover',
      label: 'تصویر کاور',
      passed: this.coverImage().length > 0,
      step: 'basics' as BuilderStep,
    },
    {
      key: 'stages',
      label: 'حداقل یک مرحله',
      passed: this.stages().length > 0,
      step: 'structure' as BuilderStep,
    },
    {
      key: 'courses',
      label: 'حداقل یک دوره',
      passed: this.totalCoursesCount() > 0,
      step: 'structure' as BuilderStep,
    },
  ]);

  readonly canPublish = computed(() => this.publishChecklist().every((c) => c.passed));
  readonly completionPercent = computed(() =>
    Math.round(
      (this.publishChecklist().filter((c) => c.passed).length /
        this.publishChecklist().length) *
        100,
    ),
  );
  readonly passedCount = computed(() => this.publishChecklist().filter((c) => c.passed).length);

  readonly currentStepIndex = computed(() =>
    this.steps.findIndex((s) => s.id === this.currentStep()),
  );
  readonly isFirstStep = computed(() => this.currentStepIndex() === 0);
  readonly isLastStep = computed(() => this.currentStepIndex() === this.steps.length - 1);

  // ✅ FIX #12: stepValidations reactive too
  readonly stepValidations = computed(() => ({
    basics:
      (this.titleValue() || '').trim().length > 0 &&
      (this.shortDescValue() || '').trim().length > 0,
    structure: this.stages().length > 0 && this.totalCoursesCount() > 0,
    settings: true,
  }));

  readonly categories = signal<any[]>([]);

  ngOnInit(): void {
    const pathId = this.route.snapshot.params['id'];
    if (pathId) {
      this.isEditMode.set(true);
      this.savedPathId = pathId;
      this.loadPath(pathId);
    }
    this.loadCategories();
    this.setupAutoSave();
  }

  private loadCategories(): void {
    this.api.get<any[]>('/categories', { limit: 200 }).subscribe({
      next: (res: any) => this.categories.set(res.data || []),
      error: () => console.error('خطا در بارگذاری دسته‌بندی‌ها'),
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupAutoSave(): void {
    this.titleControl.valueChanges
      .pipe(debounceTime(2000), takeUntil(this.destroy$))
      .subscribe(() => this.triggerAutoSave());
    this.shortDescriptionControl.valueChanges
      .pipe(debounceTime(2000), takeUntil(this.destroy$))
      .subscribe(() => this.triggerAutoSave());
  }

  private triggerAutoSave(): void {
    if (this.savedPathId && this.titleControl.value.trim()) {
      this.saveState.set('dirty');
      this.saveDraft(true).subscribe();
    }
  }

  private loadPath(id: string): void {
    this.initialLoading.set(true);
    this.lpService.getByIdAdmin(id).subscribe({
      next: (res: any) => {
        const p = res.data;
        this.titleControl.setValue(p.title || '');
        this.subtitleControl.setValue(p.subtitle || '');
        this.shortDescriptionControl.setValue(p.shortDescription || '');
        this.descriptionControl.setValue(p.description || '');
        this.iconControl.setValue(p.icon || '🛤️');
        this.difficultyControl.setValue(p.difficulty || 'mixed');
        this.categoryControl.setValue(
          typeof p.category === 'object' ? p.category?._id : p.category || '',
        );
        this.hasCertificateControl.setValue(p.hasCertificate || false);
        this.certificateTitleControl.setValue(p.certificateTitle || '');
        this.isFeaturedControl.setValue(p.isFeatured || false);
        this.coverImage.set(p.coverImage || '');
        this.stages.set(p.stages || []);
        this.tags.set(p.tags || []);
        this.targetAudience.set(p.targetAudience || []);
        this.learningOutcomes.set(p.learningOutcomes || []);
        this.status.set(p.status || 'draft');

        const expandSet = new Set<string>();
        p.stages?.slice(0, 2).forEach((s: any) => expandSet.add(s._id || s.id));
        this.expandedStages.set(expandSet);

        this.initialLoading.set(false);
      },
      error: () => {
        this.initialLoading.set(false);
        this.router.navigate(['/admin/learning-paths']);
      },
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
    const target = event.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    if (cmdOrCtrl && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveDraft(false).subscribe();
    }
    if (cmdOrCtrl && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      this.openPreview();
    }
    if (!isTyping && cmdOrCtrl && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
    }
    if (!isTyping && cmdOrCtrl && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    }
  }

  private pushHistory(): void {
    const snap = JSON.stringify(this.stages());
    if (this.history.past[this.history.past.length - 1] === snap) return;
    this.history.past.push(snap);
    if (this.history.past.length > 50) this.history.past.shift();
    this.history.future = [];
  }

  undo(): void {
    if (!this.canUndo()) {
      this.toast.info('چیزی برای بازگشت نیست');
      return;
    }
    const prev = this.history.past.pop();
    this.history.future.push(JSON.stringify(this.stages()));
    if (prev) this.stages.set(JSON.parse(prev));
  }

  redo(): void {
    if (!this.canRedo()) {
      this.toast.info('چیزی برای انجام دوباره نیست');
      return;
    }
    const next = this.history.future.pop();
    this.history.past.push(JSON.stringify(this.stages()));
    if (next) this.stages.set(JSON.parse(next));
  }

  private updateStages(newStages: IStage[]): void {
    this.pushHistory();
    this.stages.set(newStages);
  }

  private saveData(): Observable<any> {
    const data = this.buildPathData();
    return this.savedPathId
      ? this.lpService.update(this.savedPathId, data)
      : this.lpService.create(data);
  }

  saveDraft(isAutoSave = false): Observable<any> {
    if (!this.titleControl.value.trim()) {
      if (!isAutoSave) this.toast.error('عنوان مسیر را وارد کنید');
      return of(null);
    }

    this.saving.set(true);
    if (isAutoSave) this.saveState.set('saving');

    return this.saveData().pipe(
      tap({
        next: (res: any) => {
          this.lastSavedAt.set(new Date());
          this.saveState.set('saved');
          if (res?.data?._id && !this.savedPathId) {
            this.savedPathId = res.data._id;
            this.isEditMode.set(true);
            window.history.replaceState({}, '', `/admin/learning-paths/${res.data._id}/edit`);
          }
          if (!isAutoSave) this.toast.success('تغییرات ذخیره شد ✅');
        },
        error: (err: any) => {
          this.saveState.set('error');
          if (!isAutoSave) {
            const msg = err?.error?.message || err?.message || 'خطا در ذخیره‌سازی';
            this.toast.error(msg);
          }
        },
      }),
      finalize(() => this.saving.set(false)),
    );
  }

  publishPath(): void {
    if (!this.canPublish()) {
      this.toast.error('ابتدا چک‌لیست آمادگی را کامل کنید');
      return;
    }

    this.saving.set(true);

    this.saveData()
      .pipe(
        switchMap((res: any) => {
          if (res?.data?._id && !this.savedPathId) {
            this.savedPathId = res.data._id;
            this.isEditMode.set(true);
            window.history.replaceState({}, '', `/admin/learning-paths/${res.data._id}/edit`);
          }
          const pathId = res?.data?._id || this.savedPathId;
          if (!pathId) throw new Error('NO_PATH_ID');
          return this.lpService.publish(pathId);
        }),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('مسیر یادگیری منتشر شد 🎉');
          setTimeout(() => this.router.navigate(['/admin/learning-paths']), 1000);
        },
        error: (err: any) => {
          this.saving.set(false);
          const msg = err?.error?.message || err?.message || 'خطا در انتشار مسیر';
          this.toast.error(msg === 'NO_PATH_ID' ? 'خطا در ذخیره مسیر' : msg);
        },
      });
  }

  private buildPathData(): Partial<ILearningPath> {
    const catValue = this.categoryControl.value;

    const data: any = {
      title: this.titleControl.value.trim(),
      subtitle: this.subtitleControl.value.trim(),
      shortDescription: this.shortDescriptionControl.value.trim(),
      description: this.descriptionControl.value.trim(),
      icon: this.iconControl.value,
      difficulty: this.difficultyControl.value,
      tags: this.tags(),
      targetAudience: this.targetAudience(),
      learningOutcomes: this.learningOutcomes(),
      hasCertificate: this.hasCertificateControl.value,
      certificateTitle: this.certificateTitleControl.value.trim(),
      isFeatured: this.isFeaturedControl.value,
      coverImage: this.coverImage(),
      stages: this.stages(),
    };

    if (catValue && /^[0-9a-fA-F]{24}$/.test(catValue)) {
      data.category = catValue;
    }

    return data;
  }

  setStep(step: BuilderStep): void {
    this.currentStep.set(step);
  }
  nextStep(): void {
    if (!this.isLastStep()) this.setStep(this.steps[this.currentStepIndex() + 1].id);
  }
  prevStep(): void {
    if (!this.isFirstStep()) this.setStep(this.steps[this.currentStepIndex() - 1].id);
  }
  toggleFocusMode(): void {
    this.focusMode.update((v) => !v);
  }
  goBack(): void {
    this.router.navigate(['/admin/learning-paths']);
  }

  toggleEmojiPicker(e: Event): void {
    e.stopPropagation();
    this.showEmojiPicker.update((v) => !v);
  }
  selectEmoji(emoji: string): void {
    this.iconControl.setValue(emoji);
    this.showEmojiPicker.set(false);
  }

  selectCover(url: string): void {
    this.coverImage.set(url);
    this.showCoverGallery.set(false);
  }

  triggerCoverUpload(inputElem: HTMLInputElement): void {
    inputElem.click();
  }

  // ✅ FIX #11: Upload to Cloudinary instead of Base64
  async handleCoverFile(event: any): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('حداکثر حجم فایل ۵ مگابایت است');
      event.target.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.toast.error('فقط فایل‌های JPEG، PNG و WebP مجاز هستند');
      event.target.value = '';
      return;
    }

    try {
      this.uploadingCover.set(true);
      this.saveState.set('saving');
      this.toast.info('در حال آپلود تصویر...');

      const res: any = await firstValueFrom(this.lpService.uploadCoverTemp(file));
      const url = res?.data?.url || res?.data?.coverImage;
      if (!url) throw new Error('URL از سرور دریافت نشد');

      this.coverImage.set(url);
      this.saveState.set('saved');
      this.toast.success('تصویر با موفقیت آپلود شد ✅');
    } catch (err: any) {
      this.saveState.set('error');
      this.toast.error(err?.error?.message || 'آپلود تصویر ناموفق بود');
    } finally {
      this.uploadingCover.set(false);
      event.target.value = '';
    }
  }

  toggleStageExpansion(id: string): void {
    const newSet = new Set(this.expandedStages());
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    this.expandedStages.set(newSet);
  }

  expandAllStages(): void {
    this.expandedStages.set(new Set(this.stages().map((s) => s._id || (s as any).id)));
  }

  collapseAllStages(): void {
    this.expandedStages.set(new Set());
  }

  addNewStage(): void {
    const ref = this.dialog.open(StageEditorComponent, {
      width: '620px',
      maxWidth: '95vw',
      panelClass: 'custom-stage-dialog-panel',
      data: { mode: 'create' },
    });
    ref.afterClosed().subscribe((s) => {
      if (s) {
        const id = 'stage_' + Date.now();
        this.updateStages([
          ...this.stages(),
          { ...s, id, _id: id, order: this.stages().length, courses: [] },
        ]);
        this.toggleStageExpansion(id);
      }
    });
  }

  editStage(index: number): void {
    const ref = this.dialog.open(StageEditorComponent, {
      width: '620px',
      maxWidth: '95vw',
      panelClass: 'custom-stage-dialog-panel',
      data: { mode: 'edit', stage: this.stages()[index] },
    });
    ref.afterClosed().subscribe((s) => {
      if (s) {
        const next = [...this.stages()];
        next[index] = { ...next[index], ...s };
        this.updateStages(next);
      }
    });
  }

  removeStage(index: number): void {
    this.updateStages(this.stages().filter((_, i) => i !== index));
  }

  duplicateStage(index: number): void {
    const s = this.stages()[index];
    const clone = {
      ...s,
      id: 'stage_' + Date.now(),
      _id: 'stage_' + Date.now(),
      title: `${s.title} (کپی)`,
    };
    const next = [...this.stages()];
    next.splice(index + 1, 0, clone);
    this.updateStages(next);
  }

  onStageDrop(event: CdkDragDrop<IStage[]>): void {
    const next = [...this.stages()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.updateStages(next);
  }

  openCoursePicker(stageIndex: number): void {
    const ref = this.dialog.open(CoursePickerDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-panel',
      data: {
        mode: 'create',
        excludeIds: this.stages()[stageIndex].courses.map((c) =>
          typeof c.course === 'object' ? (c.course as any)._id : c.course,
        ),
      },
    });
    ref.afterClosed().subscribe((res) => {
      if (!res) return;
      const nodes = Array.isArray(res) ? res : [res];
      if (!nodes.length) return;

      const next = [...this.stages()];
      for (const node of nodes) {
        next[stageIndex].courses.push({
          id: 'cn_' + Date.now() + Math.random(),
          course: node.course,
          order: next[stageIndex].courses.length,
          isRequired: node.isRequired ?? true,
          prerequisites: node.prerequisites ?? [],
          estimatedDuration: node.course?.totalDuration || 0,
        });
      }
      this.updateStages(next);
    });
  }

  editCourseNode(sIdx: number, cIdx: number): void {
    const cn = this.stages()[sIdx].courses[cIdx];
    const ref = this.dialog.open(CoursePickerDialogComponent, {
      width: '520px',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-panel',
      data: { mode: 'edit', courseNode: cn },
    });
    ref.afterClosed().subscribe((res) => {
      if (res) {
        const next = [...this.stages()];
        next[sIdx].courses[cIdx] = { ...next[sIdx].courses[cIdx], ...res };
        this.updateStages(next);
      }
    });
  }

  removeCourseNode(sIdx: number, cIdx: number): void {
    const next = [...this.stages()];
    next[sIdx].courses.splice(cIdx, 1);
    this.updateStages(next);
  }

  onCourseDrop(event: CdkDragDrop<any[]>, stageIndex: number): void {
    const next = [...this.stages()];
    moveItemInArray(next[stageIndex].courses, event.previousIndex, event.currentIndex);
    this.updateStages(next);
  }

  addArrayItem(ctrl: FormControl, signalRef: ReturnType<typeof signal<string[]>>): void {
    const val = ctrl.value?.trim();
    if (val && !signalRef().includes(val)) {
      signalRef.set([...signalRef(), val]);
    }
    ctrl.setValue('');
  }

  removeArrayItem(item: string, signalRef: ReturnType<typeof signal<string[]>>): void {
    signalRef.set(signalRef().filter((x) => x !== item));
  }

  onChipKeydown(
    e: KeyboardEvent,
    ctrl: FormControl,
    signalRef: ReturnType<typeof signal<string[]>>,
  ): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.addArrayItem(ctrl, signalRef);
    } else if (e.key === 'Backspace' && !ctrl.value && signalRef().length) {
      signalRef.set(signalRef().slice(0, -1));
    }
  }

  openPreview(): void {
    this.dialog.open(PathPreviewComponent, {
      width: '760px',
      maxWidth: '95vw',
      panelClass: 'preview-dialog-panel',
      data: this.buildPathData(),
    });
  }

  confirmDelete(): void {
    // Implement delete confirmation dialog
  }

  duplicatePath(): void {
    // Implement duplicate action
  }

  getStageId(s: any): string {
    return s._id || s.id;
  }
  getCourseId(c: any): string {
    return typeof c.course === 'object' ? c.course._id : c.course;
  }
  getCourseTitle(c: any): string {
    return typeof c.course === 'object' ? c.course.title : 'دوره';
  }
  getCourseHue(c: any): number {
    return typeof c.course === 'object' ? c.course.hue || 210 : 210;
  }
  getCourseIcon(c: any): string {
    return typeof c.course === 'object' ? c.course.icon : '';
  }
  getCourseLectures(c: any): number {
    return typeof c.course === 'object' ? c.course.totalLectures || 0 : 0;
  }
  getCourseRating(c: any): number {
    return typeof c.course === 'object' ? c.course.averageRating || 0 : 0;
  }
}