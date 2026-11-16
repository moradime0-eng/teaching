import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule,
} from '@angular/material/dialog';
import { debounceTime, Subject, takeUntil } from 'rxjs';

import { LearningPathService, ICourseRef } from '../../../../services/learning-path.service';
import { RichTextEditorComponent } from '../../../../shared/components/rich-text-editor/rich-text-editor.component';

export interface CoursePickerDialogData {
  mode: 'create' | 'edit';
  excludeIds?: string[];
  pathCourses?: {
    courseData?: {
      _id: string;
      title: string;
    };
  }[];
  courseNode?: {
    course?: ICourseRef | string;
    customTitle?: string;
    customDescription?: string;
    isRequired: boolean;
    prerequisites?: string[];
  };
}

@Component({
  selector: 'app-course-picker-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, RichTextEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-picker-dialog.component.html',
  styleUrls: ['./course-picker-dialog.component.scss'],
})
export class CoursePickerDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<CoursePickerDialogComponent>);
  readonly data: CoursePickerDialogData = inject(MAT_DIALOG_DATA);
  private lpService = inject(LearningPathService);
  private destroy$ = new Subject<void>();

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly customTitleControl = new FormControl('', { nonNullable: true });
  readonly customDescriptionControl = new FormControl('', { nonNullable: true });
  readonly isRequiredControl = new FormControl(true, { nonNullable: true });

  readonly courses = signal<ICourseRef[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly prerequisites = signal<string[]>([]);

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly selectedCourses = computed(() => {
    const ids = this.selectedIds();
    return this.courses().filter((c) => ids.has(c._id));
  });

  // Edit mode single selection
  readonly editCourse = signal<ICourseRef | null>(null);

  readonly LEVEL_LABELS: Record<string, string> = {
    beginner: 'مبتدی',
    intermediate: 'متوسط',
    advanced: 'پیشرفته',
  };

  readonly LEVEL_CLS: Record<string, string> = {
    beginner: 'level-beginner',
    intermediate: 'level-intermediate',
    advanced: 'level-advanced',
  };

  ngOnInit(): void {
    if (this.data.mode === 'edit' && this.data.courseNode) {
      const cn = this.data.courseNode;
      const parsedCourse: ICourseRef | null =
        typeof cn.course === 'object' && cn.course !== null ? cn.course : null;
      this.editCourse.set(parsedCourse);
      this.customTitleControl.setValue(cn.customTitle || '');
      this.customDescriptionControl.setValue(cn.customDescription || '');
      this.isRequiredControl.setValue(cn.isRequired);
      this.prerequisites.set(cn.prerequisites?.map((p) => p.toString()) || []);
    }

    this.loadCourses();

    this.searchControl.valueChanges
      .pipe(debounceTime(250), takeUntil(this.destroy$))
      .subscribe((term) => this.loadCourses(term || undefined));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCourses(search?: string): void {
    this.loading.set(true);
    this.lpService.getAvailableCourses({ search, limit: 20 }).subscribe({
      next: (res: any) => {
        const filtered = (res.data || []) as ICourseRef[];
        this.courses.set(filtered);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isExcluded(id: string): boolean {
    return (this.data.excludeIds || []).includes(id);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleCourse(id: string): void {
    if (this.isExcluded(id)) return;
    this.selectedIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isPrerequisite(courseId: string): boolean {
    return this.prerequisites().includes(courseId);
  }

  togglePrerequisite(courseId: string): void {
    this.prerequisites.update((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  }

  clearSearch(): void {
    this.searchControl.setValue('');
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
    return parts.length ? parts.join(' و ') : `${this.faNum(h)} ساعت`;
  }

  faNum(n: number | string): string {
    const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(n).replace(/\d/g, (d) => fa[+d]);
  }

  faDecimal(n: number): string {
    return this.faNum(n.toFixed(1));
  }

  getThumbStyle(hue: number): Record<string, string> {
    return {
      background: `linear-gradient(135deg, hsl(${hue} 68% 52%) 0%, hsl(${(hue + 38) % 360} 72% 38%) 100%)`,
    };
  }

  canConfirm(): boolean {
    if (this.data.mode === 'edit') return true;
    return this.selectedCount() > 0;
  }

  confirm(): void {
    if (this.data.mode === 'edit') {
      this.dialogRef.close({
        course: this.editCourse(),
        isRequired: this.isRequiredControl.value,
        prerequisites: this.prerequisites(),
        customTitle: this.customTitleControl.value.trim() || undefined,
        customDescription: this.customDescriptionControl.value.trim() || undefined,
      });
    } else {
      const nodes = this.selectedCourses().map((c) => ({
        course: c,
        isRequired: true,
        prerequisites: [],
      }));
      this.dialogRef.close(nodes);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}