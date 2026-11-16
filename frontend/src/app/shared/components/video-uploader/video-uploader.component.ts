/**
 * 📤 Video Uploader Component
 *
 * کامپوننت آپلود ویدیو با Drag & Drop + Progress Bar + لغو + تلاش مجدد
 * از S3 Presigned URL برای آپلود مستقیم استفاده می‌کند.
 */

import { Component, Input, Output, EventEmitter, signal, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoUploadService, UploadProgressEvent, UploadStatus } from '../../../core/services/video-upload.service';

@Component({
  selector: 'app-video-uploader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- حالت ایدل -->
    <div
      *ngIf="status() === 'idle'"
      class="upload-zone"
      [class.drag-over]="isDragOver()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      (click)="fileInput.click()"
    >
      <input
        #fileInput
        type="file"
        [accept]="acceptedFormats"
        (change)="onFileSelected($event)"
        class="hidden"
      />

      <div class="upload-icon">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>

      <p class="text-sm text-gray-600 mt-2">
        فایل را اینجا رها کنید یا کلیک کنید
      </p>
      <p class="text-xs text-gray-400 mt-1">
        فرمت‌های مجاز: {{ formatLabels() }}
      </p>
      <p class="text-xs text-gray-400">
        حداکثر حجم: {{ formatFileSize(maxSize) }}
      </p>
    </div>

    <!-- حالت آپلود -->
    <div *ngIf="status() === 'uploading'" class="upload-progress">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-gray-700 truncate max-w-xs">
          {{ fileName() }}
        </span>
        <span class="text-sm text-gray-500">
          {{ formatFileSize(currentSize()) }} / {{ formatFileSize(maxSize) }}
        </span>
      </div>

      <!-- نوار پیشرفت -->
      <div class="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div
          class="bg-blue-600 h-3 rounded-full transition-all duration-300"
          [style.width.%]="progress()"
        ></div>
      </div>

      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-500">
          {{ progress() }}% آپلود شده
        </span>
        <button
          (click)="cancelUpload()"
          class="text-sm text-red-600 hover:text-red-800"
        >
          لغو
        </button>
      </div>
    </div>

    <!-- حالت پردازش -->
    <div *ngIf="status() === 'processing'" class="upload-processing">
      <div class="flex items-center gap-3">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <div>
          <p class="text-sm font-medium text-gray-700">در حال پردازش ویدیو...</p>
          <p class="text-xs text-gray-500">تبدیل به HLS و تولید thumbnail</p>
        </div>
      </div>

      <div class="w-full bg-gray-200 rounded-full h-2 mt-3">
        <div
          class="bg-green-500 h-2 rounded-full transition-all duration-500"
          [style.width.%]="processingProgress()"
        ></div>
      </div>
      <p class="text-xs text-gray-500 mt-1">{{ processingProgress() }}%</p>
    </div>

    <!-- حالت تکمیل -->
    <div *ngIf="status() === 'completed'" class="upload-completed bg-green-50 border border-green-200 rounded-lg p-4">
      <div class="flex items-center gap-3">
        <svg class="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p class="text-sm font-medium text-green-800">آپلود با موفقیت انجام شد</p>
          <p class="text-xs text-green-600">{{ fileName() }}</p>
        </div>
      </div>
    </div>

    <!-- حالت خطا -->
    <div *ngIf="status() === 'error'" class="upload-error bg-red-50 border border-red-200 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <svg class="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p class="text-sm font-medium text-red-800">خطا در آپلود</p>
            <p class="text-xs text-red-600">{{ errorMessage() }}</p>
          </div>
        </div>
        <button
          (click)="retryUpload()"
          class="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
        >
          تلاش مجدد
        </button>
      </div>
    </div>
  `,
  styles: [`
    .upload-zone {
      border: 2px dashed #d1d5db;
      border-radius: 0.75rem;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
    }

    .upload-zone:hover {
      border-color: #3b82f6;
      background-color: #eff6ff;
    }

    .upload-zone.drag-over {
      border-color: #3b82f6;
      background-color: #dbeafe;
    }

    .hidden {
      display: none;
    }
  `],
})
export class VideoUploaderComponent implements OnDestroy {
  private uploadService = inject(VideoUploadService);

  // ─── Input‌ها ───
  @Input() lectureId: string | null = null;
  @Input() courseId: string | null = null;
  @Input() type: 'lecture-video' | 'promo-video' | 'resource' = 'lecture-video';
  @Input() maxSize: number = 5 * 1024 * 1024 * 1024; // 5GB پیش‌فرض
  @Input() acceptedFormats: string = 'video/mp4,video/webm,video/quicktime';

  // ─── Output‌ها ───
  @Output() uploadComplete = new EventEmitter<{ url: string; key: string }>();
  @Output() uploadError = new EventEmitter<string>();

  // ─── State ───
  status = signal<string>('idle');
  progress = signal(0);
  processingProgress = signal(0);
  fileName = signal('');
  currentSize = signal(0);
  errorMessage = signal('');
  isDragOver = signal(false);

  private selectedFile: File | null = null;
  private abortController: AbortController | null = null;
  private pollingSubscription: any = null;

  formatLabels(): string {
    if (this.type === 'resource') {
      return 'PDF, ZIP, DOC, DOCX, XLSX, PPT, PPTX, RAR, TXT';
    }
    return 'MP4, WebM, MOV';
  }

  // ─── Drag & Drop ───
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  // ─── انتخاب فایل ───
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
      input.value = ''; // ریست کردن input
    }
  }

  // ─── پردازش فایل انتخاب شده ───
  private handleFile(file: File): void {
    // اعتبارسنجی حجم
    if (file.size > this.maxSize) {
      this.errorMessage.set(`حجم فایل (${this.formatFileSize(file.size)}) از حداکثر مجاز (${this.formatFileSize(this.maxSize)}) بیشتر است`);
      this.status.set('error');
      this.uploadError.emit(this.errorMessage());
      return;
    }

    this.selectedFile = file;
    this.fileName.set(file.name);
    this.currentSize.set(file.size);
    this.status.set('idle');
    this.progress.set(0);

    this.startUpload();
  }

  // ─── شروع آپلود ───
  private async startUpload(): Promise<void> {
    if (!this.selectedFile) return;

    this.status.set('uploading');
    this.progress.set(0);
    this.abortController = new AbortController();

    try {
      const result = await this.uploadService.uploadVideo(
        this.selectedFile,
        this.lectureId,
        this.courseId,
        this.type,
        (event: UploadProgressEvent) => this.handleProgressEvent(event),
        this.abortController.signal,
      );

      // اگر ویدیو باشد، وضعیت پردازش را بررسی کن
      if (this.type === 'lecture-video' || this.type === 'promo-video') {
        this.status.set('processing');
        this.startProcessingPolling();
      } else {
        this.status.set('completed');
        this.uploadComplete.emit(result);
      }
    } catch (error: any) {
      this.errorMessage.set(error.message || 'خطا در آپلود');
      this.status.set('error');
      this.uploadError.emit(this.errorMessage());
    }
  }

  // ─── مدیریت رویداد پیشرفت ───
  private handleProgressEvent(event: UploadProgressEvent): void {
    switch (event.type) {
      case 'progress':
        this.progress.set(event.progress || 0);
        break;
      case 'status':
        if (event.status) {
          this.status.set(event.status);
        }
        break;
      case 'error':
        this.errorMessage.set(event.error || 'خطای ناشناخته');
        this.status.set('error');
        this.uploadError.emit(this.errorMessage());
        break;
      case 'success':
        // آپلود موفق
        break;
    }
  }

  // ─── polling وضعیت پردازش ───
  private startProcessingPolling(): void {
    if (!this.lectureId) {
      this.status.set('completed');
      return;
    }

    this.pollingSubscription = this.uploadService.checkProcessingStatus(this.lectureId).subscribe({
      next: (status) => {
        this.processingProgress.set(status.progress);

        if (status.status === 'READY') {
          this.status.set('completed');
          this.uploadComplete.emit({ url: '', key: '' });
        } else if (status.status === 'FAILED') {
          this.errorMessage.set(status.error || 'خطا در پردازش ویدیو');
          this.status.set('error');
          this.uploadError.emit(this.errorMessage());
        }
      },
      error: (error) => {
        this.errorMessage.set('خطا در بررسی وضعیت پردازش');
        this.status.set('error');
        this.uploadError.emit(this.errorMessage());
      },
    });
  }

  // ─── لغو آپلود ───
  cancelUpload(): void {
    this.abortController?.abort();
    this.status.set('idle');
    this.progress.set(0);
  }

  // ─── تلاش مجدد ───
  retryUpload(): void {
    this.status.set('idle');
    this.progress.set(0);
    this.errorMessage.set('');

    if (this.selectedFile) {
      this.startUpload();
    }
  }

  // ─── فرمت حجم فایل ───
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
  }
}
