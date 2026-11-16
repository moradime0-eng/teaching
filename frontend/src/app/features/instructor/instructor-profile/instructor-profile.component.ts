import { Component, OnInit, signal, Inject, PLATFORM_ID, inject } from '@angular/core';
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
import { ApiService } from '../../../core/services/api.service';
import { environment } from '../../../../environments/environment.development';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-instructor-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterModule, ImageFallbackDirective, RichTextEditorComponent],
  templateUrl: './instructor-profile.component.html',
  styleUrl: './instructor-profile.component.scss',
})
export class InstructorProfileComponent implements OnInit {
  profileForm!: FormGroup;
  isUpdating = signal(false);
  isUploadingAvatar = signal(false);
  successMsg = signal('');
  errorMsg = signal('');
  avatarPreview = signal<string | null>(null);
  private isBrowser = false;

  constructor(
    private fb: FormBuilder,
    public authService: AuthService,
    private api: ApiService,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    const instructor = user?.instructorProfile;

    this.profileForm = this.fb.group({
      fullName: [user?.fullName || '', [Validators.required, Validators.minLength(3)]],
      phone: [user?.phone || '', [Validators.pattern(/^09\d{9}$/)]],
      bio: [user?.bio || '', [Validators.maxLength(500)]],
      headline: [instructor?.headline || '', [Validators.maxLength(200)]],
      biography: [instructor?.biography || '', [Validators.maxLength(3000)]],
      website: [instructor?.website || ''],
      linkedin: [instructor?.socialLinks?.linkedin || ''],
      twitter: [instructor?.socialLinks?.twitter || ''],
      youtube: [instructor?.socialLinks?.youtube || ''],
      instagram: [instructor?.socialLinks?.instagram || ''],
      // نمایش تخصص‌ها با کاما و فاصله در فرم
      expertise: [instructor?.expertise?.join('، ') || ''],
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
  get bioCtrl(): AbstractControl {
    return this.profileForm.get('bio')!;
  }
  get headlineCtrl(): AbstractControl {
    return this.profileForm.get('headline')!;
  }
  get biographyCtrl(): AbstractControl {
    return this.profileForm.get('biography')!;
  }

  get userInitials(): string {
    const name = this.fullNameCtrl?.value || this.authService.currentUser()?.fullName || 'کاربر';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]} ${parts[1][0]}`;
    return parts[0]?.[0] || 'ک';
  }

  get isFormDirty(): boolean {
    return this.profileForm ? this.profileForm.dirty : false;
  }

  /** تبدیل آدرس عکس (شامل Base64 محلی و آدرس‌های سرور) */
  resolveAvatarUrl(url: string | null): string | null {
    if (!url) return null;
    if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) return `https:${url}`;
    const base = environment.socketUrl
      ? environment.socketUrl.replace(/\/$/, '')
      : window.location.origin;
    return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
  }

  /** ✅ تغییر تصویر: نمایش آنی محلی + آپلود همزمان به سرور */
  onAvatarChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];

    if (file.size > 5 * 1024 * 1024) {
      this.errorMsg.set('حجم تصویر نباید بیشتر از ۵ مگابایت باشد.');
      return;
    }

    // ۱. پیش‌نمایش آنی محلی با FileReader
    if (this.isBrowser) {
      const reader = new FileReader();
      reader.onload = () => {
        const localBase64 = reader.result as string;
        this.avatarPreview.set(localBase64); // بلافاصله عکس روی صفحه ظاهر می‌شود
      };
      reader.readAsDataURL(file);
    }

    // ۲. ارسال فایل به بک‌اند جهت ذخیره دائم در دیتابیس
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
        this.successMsg.set('تصویر پروفایل با موفقیت در سرور آپلود و ذخیره شد.');
      },
      error: (err: any) => {
        this.isUploadingAvatar.set(false);
        console.error('Avatar Upload Error:', err);
        this.errorMsg.set(err?.error?.message || 'خطا در آپلود تصویر در سرور');
      },
    });
  }

  resetForm(): void {
    const user = this.authService.currentUser();
    const instructor = user?.instructorProfile;
    this.profileForm.reset({
      fullName: user?.fullName || '',
      phone: user?.phone || '',
      bio: user?.bio || '',
      headline: instructor?.headline || '',
      biography: instructor?.biography || '',
      website: instructor?.website || '',
      linkedin: instructor?.socialLinks?.linkedin || '',
      twitter: instructor?.socialLinks?.twitter || '',
      youtube: instructor?.socialLinks?.youtube || '',
      instagram: instructor?.socialLinks?.instagram || '',
      expertise: instructor?.expertise?.join('، ') || '',
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

    const profilePayload: any = {};
    if (formVal.fullName?.trim()) profilePayload.fullName = formVal.fullName.trim();
    if (formVal.phone?.trim()) profilePayload.phone = formVal.phone.trim();
    if (formVal.bio?.trim()) profilePayload.bio = formVal.bio.trim();

    this.authService.updateProfile(profilePayload).subscribe({
      next: () => {
        // ✅ اصلاح شد: هم کامای فارسی (،) و هم انگلیسی (,) شناخته می‌شوند
        const expertiseArr = formVal.expertise
          ? formVal.expertise
              .split(/[,،]/)
              .map((s: string) => s.trim())
              .filter(Boolean)
          : [];

        const instructorPayload = {
          headline: formVal.headline?.trim() || '',
          biography: formVal.biography?.trim() || '',
          website: formVal.website?.trim() || '',
          socialLinks: {
            linkedin: formVal.linkedin?.trim() || '',
            twitter: formVal.twitter?.trim() || '',
            youtube: formVal.youtube?.trim() || '',
            instagram: formVal.instagram?.trim() || '',
          },
          expertise: expertiseArr,
        };

        this.api.put('/users/instructor-profile', instructorPayload).subscribe({
          next: () => {
            this.isUpdating.set(false);
            this.profileForm.markAsPristine();
            this.successMsg.set('پروفایل مدرس با موفقیت بروزرسانی شد.');
            this.authService.loadUserProfile().subscribe();
            if (this.isBrowser) window.scrollTo({ top: 0, behavior: 'smooth' });
          },
          error: (err) => {
            this.isUpdating.set(false);
            this.errorMsg.set(err?.error?.message || 'خطا در بروزرسانی پروفایل مدرس.');
          },
        });
      },
      error: (err) => {
        this.isUpdating.set(false);
        this.errorMsg.set(err?.error?.message || 'خطا در بروزرسانی اطلاعات کاربری.');
      },
    });
  }
}
