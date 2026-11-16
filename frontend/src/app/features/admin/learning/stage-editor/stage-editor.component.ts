import { Component, inject, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { toSignal } from '@angular/core/rxjs-interop';
import { RichTextEditorComponent } from '../../../../shared/components/rich-text-editor/rich-text-editor.component';

export interface StageEditorData {
  mode: 'create' | 'edit';
  stage?: {
    title: string;
    description?: string;
    icon?: string;
    color?: string;
    milestone?: {
      title: string;
      description: string;
      badge: string;
    };
  };
}

@Component({
  selector: 'app-stage-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, RichTextEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stage-editor.component.html',
  styleUrls: ['./stage-editor.component.scss'],
})
export class StageEditorComponent {
  private dialogRef = inject(MatDialogRef<StageEditorComponent>);
  readonly data: StageEditorData = inject(MAT_DIALOG_DATA);

  readonly hasMilestoneControl = new FormControl(false, { nonNullable: true });

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(300)],
    }),
    icon: new FormControl('📚', { nonNullable: true }),
    color: new FormControl('#e4532f', { nonNullable: true }),
    milestoneTitle: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(60)],
    }),
    milestoneDescription: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(140)],
    }),
    milestoneBadge: new FormControl('🏆', { nonNullable: true }),
  });

  readonly titleValue = toSignal(this.form.controls.title.valueChanges, {
    initialValue: this.form.controls.title.value,
  });
  readonly descriptionValue = toSignal(this.form.controls.description.valueChanges, {
    initialValue: this.form.controls.description.value,
  });
  readonly iconValue = toSignal(this.form.controls.icon.valueChanges, {
    initialValue: this.form.controls.icon.value,
  });
  readonly colorValue = toSignal(this.form.controls.color.valueChanges, {
    initialValue: this.form.controls.color.value,
  });
  readonly milestoneEnabled = toSignal(this.hasMilestoneControl.valueChanges, {
    initialValue: this.hasMilestoneControl.value,
  });
  readonly milestoneBadgeValue = toSignal(this.form.controls.milestoneBadge.valueChanges, {
    initialValue: this.form.controls.milestoneBadge.value,
  });
  readonly milestoneTitleValue = toSignal(this.form.controls.milestoneTitle.valueChanges, {
    initialValue: this.form.controls.milestoneTitle.value,
  });
  readonly milestoneDescValue = toSignal(this.form.controls.milestoneDescription.valueChanges, {
    initialValue: this.form.controls.milestoneDescription.value,
  });

  readonly titleLength = computed(() => this.titleValue()?.length || 0);
  readonly descriptionLength = computed(() => this.descriptionValue()?.length || 0);
  readonly milestoneTitleLength = computed(() => this.milestoneTitleValue()?.length || 0);
  readonly milestoneDescLength = computed(() => this.milestoneDescValue()?.length || 0);

  readonly canSave = computed(() => !!this.titleValue()?.trim());

  /** Quick emoji picker (matches QUICK_EMOJIS) */
  readonly popularIcons = [
    '💻',
    '🎨',
    '🧠',
    '📚',
    '🚀',
    '⚡',
    '🔥',
    '🎯',
    '🛠️',
    '📊',
    '🔬',
    '🌟',
    '🎓',
    '💡',
    '🎵',
    '🎮',
    '📝',
    '🔍',
    '🌱',
    '🎬',
    '🏆',
    '⭐',
    '📈',
    '🎪',
  ];

  /** Stage color palette (matches STAGE_COLORS / design system) */
  readonly colorPresets = [
    '#e4532f', // accent
    '#0f7d68', // teal
    '#2f6fd0', // blue
    '#6c5ce7', // violet
    '#d94f6a', // rose
    '#dd9a28', // amber
    '#4e9f3d', // green
    '#c43f1d', // accent-deep
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#8b5cf6', // purple
    '#f97316', // orange
  ];

  readonly milestoneBadges = ['🏆', '🥇', '🎖️', '⭐', '🚀', '💎', '🎓', '🔥'];

  constructor() {
    if (this.data.mode === 'edit' && this.data.stage) {
      const s = this.data.stage;
      this.form.patchValue({
        title: s.title,
        description: s.description || '',
        icon: s.icon || '📚',
        color: s.color || '#e4532f',
        milestoneTitle: s.milestone?.title || '',
        milestoneDescription: s.milestone?.description || '',
        milestoneBadge: s.milestone?.badge || '🏆',
      });
      this.hasMilestoneControl.setValue(!!s.milestone);
    }
  }

  selectIcon(icon: string): void {
    this.form.controls.icon.setValue(icon);
  }

  selectColor(color: string): void {
    this.form.controls.color.setValue(color);
  }

  selectMilestoneBadge(badge: string): void {
    this.form.controls.milestoneBadge.setValue(badge);
  }

  toggleMilestone(): void {
    this.hasMilestoneControl.setValue(!this.hasMilestoneControl.value);
  }

  faNum(n: number | string): string {
    const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(n).replace(/\d/g, (d) => fa[+d]);
  }

  save(): void {
    const title = this.form.controls.title.value.trim();
    if (!title) {
      this.form.controls.title.markAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const result: Record<string, unknown> = {
      title,
      description: value.description?.trim() || undefined,
      icon: value.icon || '📚',
      color: value.color || '#e4532f',
    };

    if (this.hasMilestoneControl.value && value.milestoneTitle?.trim()) {
      result['milestone'] = {
        title: value.milestoneTitle.trim(),
        description: value.milestoneDescription?.trim() || '',
        badge: value.milestoneBadge || '🏆',
      };
    } else {
      result['milestone'] = undefined;
    }

    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
