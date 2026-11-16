import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterModule, ImageFallbackDirective, RichTextEditorComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  profileForm!: FormGroup;
  isUpdating = signal(false);
  isUploadingAvatar = signal(false);
  successMsg = signal('');
  errorMsg = signal('');
  copiedField = signal<string | null>(null);
  avatarPreview = signal<string | null>(null);

  readonly maxBioLength = 300;
  private isBrowser = false;

  constructor(
    private fb: FormBuilder,
    public authService: AuthService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();

    this.profileForm = this.fb.group({
      fullName: [user?.fullName || '', [Validators.required, Validators.minLength(3)]],
      phone: [user?.phone || '', [Validators.pattern(/^09\d{9}$/)]],
      bio: [user?.bio || '', [Validators.maxLength(this.maxBioLength)]],
    });

    if (user?.avatar) {
      this.avatarPreview.set(user.avatar);
    }
  }

  get fullNameCtrl(): AbstractControl {
    return this.profileForm.get('fullName')!;
  }
  get phoneCtrl(): AbstractControl {
    return this.profileForm.get('phone')!;
  }
  get bioCtrl(): AbstractControl | null {
    return this.profileForm.get('bio');
  }

  get bioLength(): number {
    return this.bioCtrl?.value?.length || 0;
  }

  get userInitials(): string {
    const name = this.fullNameCtrl?.value || this.authService.currentUser()?.fullName || 'کاربر';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]} ${parts[1][0]}`;
    }
    return parts[0]?.[0] || 'ک';
  }

  get isFormDirty(): boolean {
    return this.profileForm ? this.profileForm.dirty : false;
  }

  /** تغییر تصویر: پیش‌نمایش آنی + آپلود همزمان به سرور (مشابه پروفایل مدرس) */
  onAvatarChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];

    if (file.size > 5 * 1024 * 1024) {
      this.errorMsg.set('حجم تصویر نباید بیشتر از ۵ مگابایت باشد.');
      return;
    }

    // ۱. پیش‌نمایش آنی محلی
    if (this.isBrowser) {
      const reader = new FileReader();
      reader.onload = () => {
        const localBase64 = reader.result as string;
        this.avatarPreview.set(localBase64);
      };
      reader.readAsDataURL(file);
    }

    // ۲. آپلود همزمان به سرور جهت ذخیره دائم
    this.isUploadingAvatar.set(true);
    this.errorMsg.set('');
    this.successMsg.set('');

    this.authService.uploadAvatar(file).subscribe({
      next: (res: any) => {
        this.isUploadingAvatar.set(false);
        const serverAvatarUrl = res?.data?.avatar || res?.data?.user?.avatar || res?.avatar;
        if (serverAvatarUrl) {
          this.avatarPreview.set(serverAvatarUrl);
        }
        this.successMsg.set('تصویر پروفایل با موفقیت در سرور ذخیره شد.');
      },
      error: (err: any) => {
        this.isUploadingAvatar.set(false);
        console.error('Avatar Upload Error:', err);
        this.errorMsg.set(err?.error?.message || 'خطا در آپلود تصویر');
      },
    });
  }

  copyToClipboard(text: string, fieldKey: string): void {
    if (!this.isBrowser || !text) return;

    navigator.clipboard.writeText(text).then(() => {
      this.copiedField.set(fieldKey);
      setTimeout(() => this.copiedField.set(null), 2500);
    });
  }

  resetForm(): void {
    const user = this.authService.currentUser();
    this.profileForm.reset({
      fullName: user?.fullName || '',
      phone: user?.phone || '',
      bio: user?.bio || '',
    });
    this.avatarPreview.set(user?.avatar || null);
    this.successMsg.set('');
    this.errorMsg.set('');
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isUpdating.set(true);
    this.successMsg.set('');
    this.errorMsg.set('');

    const formVal = this.profileForm.value;

    // 🔥 پاک‌سازی پې‌لود جهت جلوگیری از خطای Validation بک‌اند
    const payload: any = {};

    // fullName الزامی است
    if (formVal.fullName?.trim()) {
      payload.fullName = formVal.fullName.trim();
    }

    // فیلدهای اختیاری: فقط در صورت پر بودن ارسال کن
    if (formVal.phone?.trim()) {
      payload.phone = formVal.phone.trim();
    }

    if (formVal.bio?.trim()) {
      payload.bio = formVal.bio.trim();
    }

    // ❌ آواتار از اینجا حذف شد چون در onAvatarChange مستقیماً آپلود می‌شود

    this.authService.updateProfile(payload).subscribe({
      next: () => {
        this.isUpdating.set(false);
        this.profileForm.markAsPristine();
        this.successMsg.set('اطلاعات کاربری شما با موفقیت بروزرسانی و ذخیره شد.');

        if (this.isBrowser) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      },
      error: (err) => {
        this.isUpdating.set(false);

        // 🆕 نمایش خطای دقیق بک‌اند به کاربر
        let msg = 'متأسفانه در ثبت اطلاعات خطایی رخ داد.';
        if (err?.error?.errors && Array.isArray(err.error.errors) && err.error.errors.length > 0) {
          const firstErr = err.error.errors[0];
          msg = `خطای اعتبارسنجی: ${firstErr.msg || firstErr.message || ''} (${firstErr.path || firstErr.param || ''})`;
        } else if (err?.error?.message) {
          msg = err.error.message;
        }

        this.errorMsg.set(msg);
      },
    });
  }
}
