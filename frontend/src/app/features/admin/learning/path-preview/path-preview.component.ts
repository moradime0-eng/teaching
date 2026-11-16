import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { IStage } from '../../../../services/learning-path.service';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';
import { FaNumPipe } from '../../../../shared/pipes/fa-num.pipe';
import { MarkdownPipe } from '../../../../shared/pipes/markdown.pipe';

export interface PathPreviewData {
  title: string;
  subtitle?: string;
  shortDescription?: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
  tags?: string[];
  stages?: IStage[];

  // فیلدهای جدید برای هماهنگی با ظاهر React
  targetAudience?: string[];
  learningOutcomes?: string[];
  hasCertificate?: boolean;
  certificateTitle?: string;
}

@Component({
  selector: 'app-path-preview',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, DurationPipe, FaNumPipe, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './path-preview.component.html',
  styleUrls: ['./path-preview.component.scss'],
})
export class PathPreviewComponent {
  readonly dialogRef = inject(MatDialogRef<PathPreviewComponent>);
  readonly data: PathPreviewData = inject(MAT_DIALOG_DATA);

  // Computed statistics
  readonly totalCourses = computed(() => {
    return (this.data.stages || []).reduce((sum, s) => sum + (s.courses?.length || 0), 0);
  });

  readonly totalDuration = computed(() => {
    return (this.data.stages || []).reduce(
      (sum, s) =>
        sum + (s.courses?.reduce((cSum, c: any) => cSum + (c.estimatedDuration || 0), 0) || 0),
      0,
    );
  });

  // Difficulty mapping matching React's DIFFICULTY_META
  readonly difficultyMeta: Record<string, { label: string; color: string; bg: string }> = {
    beginner: { label: 'مبتدی', color: '#4e9f3d', bg: '#e7f2e2' },
    intermediate: { label: 'متوسط', color: '#dd9a28', bg: '#f8eeda' },
    advanced: { label: 'پیشرفته', color: '#d94f6a', bg: '#fae6ea' },
    mixed: { label: 'ترکیبی', color: '#6c5ce7', bg: '#eae7fb' },
  };

  get currentDifficulty() {
    const diff = this.data.difficulty || 'mixed';
    return this.difficultyMeta[diff];
  }

  // Helpers for template
  getCourseTitle(courseNode: any): string {
    return (
      courseNode.customTitle ||
      (typeof courseNode.course === 'object' ? courseNode.course.title : 'دوره آموزشی')
    );
  }

  getCourseDuration(courseNode: any): number {
    return courseNode?.estimatedDuration || 0;
  }

  getCourseLectures(courseNode: any): number {
    return typeof courseNode.course === 'object'
      ? courseNode.course.lectures || courseNode.course.totalLectures || 0
      : 0;
  }

  getCourseRating(courseNode: any): number {
    return typeof courseNode.course === 'object'
      ? courseNode.course.averageRating || courseNode.course.rating || 0
      : 0;
  }

  getCourseHue(courseNode: any): number {
    return typeof courseNode.course === 'object' ? courseNode.course.hue || 210 : 210;
  }

  getCourseIcon(courseNode: any): string {
    return typeof courseNode.course === 'object' ? courseNode.course.icon || '📚' : '📚';
  }

  close(): void {
    this.dialogRef.close();
  }
}
