import { Component, inject, signal, computed, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../../../core/services/api.service';
import { ToastService } from '../../../../core/services/toast.service';
import { RichTextEditorComponent } from '../../../../shared/components/rich-text-editor/rich-text-editor.component';

export interface PageContext {
  url: string;
  route: string;
  title: string;
  userRole: string;
  courseId?: string;
  lectureId?: string;
  timestamp: string;
}

interface DialogData {
  context: PageContext;
}

interface Category {
  value: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

interface Priority {
  value: string;
  label: string;
  color: string;
  icon: string;
}

@Component({
  selector: 'app-quick-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RichTextEditorComponent,
  ],
  templateUrl: './quick-ticket-dialog.component.html',
  styleUrl: './quick-ticket-dialog.component.scss',
})
export class QuickTicketDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<QuickTicketDialogComponent>);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  @Inject(MAT_DIALOG_DATA) public data: DialogData | null = null;

  // Form state
  readonly subject = signal('');
  readonly message = signal('');
  readonly category = signal('technical');
  readonly priority = signal('medium');
  readonly isSubmitting = signal(false);
  readonly submitError = signal<string | null>(null);
  readonly showContext = signal(false);

  // Categories matching backend
  readonly categories: Category[] = [
    {
      value: 'technical',
      label: 'مشکل فنی',
      icon: 'bug_report',
      color: 'blue',
      description: 'خطاها، مشکلات پخش و باگ‌ها',
    },
    {
      value: 'billing',
      label: 'مالی و پرداخت',
      icon: 'payments',
      color: 'green',
      description: 'فاکتور، پرداخت و بازگشت وجه',
    },
    {
      value: 'course',
      label: 'دوره‌های آموزشی',
      icon: 'school',
      color: 'purple',
      description: 'سوالات درباره محتوای دوره‌ها',
    },
    {
      value: 'account',
      label: 'حساب کاربری',
      icon: 'manage_accounts',
      color: 'amber',
      description: 'ورود، رمز عبور و پروفایل',
    },
    {
      value: 'other',
      label: 'موارد دیگر',
      icon: 'help_outline',
      color: 'slate',
      description: 'سایر سوالات و پیشنهادات',
    },
  ];

  readonly priorities: Priority[] = [
    { value: 'low', label: 'کم', color: 'slate', icon: 'low_priority' },
    { value: 'medium', label: 'متوسط', color: 'blue', icon: 'drag_handle' },
    { value: 'high', label: 'زیاد', color: 'amber', icon: 'priority_high' },
    { value: 'urgent', label: 'فوری', color: 'red', icon: 'error' },
  ];

  // Computed
  readonly selectedCategory = computed(() => 
    this.categories.find(c => c.value === this.category())
  );
  readonly selectedPriority = computed(() => 
    this.priorities.find(p => p.value === this.priority())
  );

  readonly canSubmit = computed(() => 
    this.subject().trim().length >= 5 &&
    this.message().trim().length >= 10 &&
    !!this.category() &&
    !this.isSubmitting()
  );

  ngOnInit(): void {
    // Auto-focus subject input after dialog opens
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        const subjectInput = document.querySelector('#ticket-subject') as HTMLInputElement;
        subjectInput?.focus();
      }, 100);
    }
  }

  selectCategory(value: string): void {
    this.category.set(value);
  }

  selectPriority(value: string): void {
    this.priority.set(value);
  }

  toggleContext(): void {
    this.showContext.update(v => !v);
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);
    this.submitError.set(null);

    try {
      const context = this.data?.context;
      
      // Build message with context
      let fullMessage = this.message();
      
      if (context && (context.courseId || context.lectureId || context.url !== '/')) {
        fullMessage += '\n\n---\n📍 **اطلاعات صفحه (خودکار):**\n';
        fullMessage += `• صفحه: ${context.title} (${context.url})\n`;
        if (context.courseId) fullMessage += `• شناسه دوره: ${context.courseId}\n`;
        if (context.lectureId) fullMessage += `• شناسه جلسه: ${context.lectureId}\n`;
        fullMessage += `• زمان: ${new Date(context.timestamp).toLocaleString('fa-IR')}\n`;
        fullMessage += `• نقش کاربر: ${context.userRole}\n`;
      }

      const payload = {
        subject: this.subject().trim(),
        category: this.category(),
        priority: this.priority(),
        message: fullMessage,
        relatedCourse: context?.courseId || undefined,
      };

      await this.api.post<any>('/tickets', payload).toPromise();
      
      this.dialogRef.close({ success: true });
    } catch (error: any) {
      const errorMsg = error?.error?.message || 'خطا در ثبت تیکت. لطفاً دوباره تلاش کنید.';
      this.submitError.set(errorMsg);
      this.toast.error(errorMsg);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  close(): void {
    this.dialogRef.close({ success: false });
  }

  getCategoryColorClass(color: string): string {
    return `cat-${color}`;
  }

  getPriorityColorClass(color: string): string {
    return `pri-${color}`;
  }
}