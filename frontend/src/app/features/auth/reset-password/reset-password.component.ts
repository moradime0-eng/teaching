import { Component, OnInit, inject, signal, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' })),
      ]),
    ]),
  ],
})
export class ResetPasswordComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  public themeService = inject(ThemeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  resetForm: FormGroup;
  email = signal('');
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  isLoading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  isSubmitting = signal(false);

  // OTP digits
  otpDigits: string[] = ['', '', '', '', '', ''];

  constructor() {
    this.resetForm = this.fb.group(
      {
        newPassword: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/),
          ],
        ],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['email']) {
        this.email.set(params['email']);
      } else {
        this.errorMessage.set('لطفاً ابتدا درخواست بازیابی رمز عبور بدهید.');
        if (isPlatformBrowser(this.platformId)) {
          setTimeout(() => this.router.navigate(['/auth/forgot-password']), 3000);
        }
      }
    });
  }

  // OTP input handling
  onOtpInput(event: any, index: number): void {
    const value = event.target.value;
    if (value && /^\d$/.test(value)) {
      this.otpDigits[index] = value;
      const nextInput = event.target.parentElement?.querySelector(`#reset-otp-${index + 1}`) as HTMLInputElement;
      if (nextInput) nextInput.focus();
      if (this.otpDigits.every((d) => d !== '')) {
        this.onSubmit();
      }
    } else {
      this.otpDigits[index] = '';
      event.target.value = '';
    }
  }

  onOtpKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.otpDigits[index] && index > 0) {
      const prev = (event.target as HTMLElement).parentElement?.querySelector(`#reset-otp-${index - 1}`) as HTMLInputElement;
      if (prev) {
        prev.focus();
        this.otpDigits[index - 1] = '';
      }
    }
  }

  onSubmit(): void {
    const otpCode = this.otpDigits.join('');
    if (otpCode.length !== 6) {
      this.errorMessage.set('لطفاً کد ۶ رقمی را کامل وارد کنید.');
      return;
    }

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.isSubmitting.set(true);

    const { newPassword, confirmPassword } = this.resetForm.value;

    this.authService.resetPassword(this.email(), otpCode, newPassword, confirmPassword).subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage.set('✅ رمز عبور با موفقیت تغییر یافت. در حال انتقال به صفحه ورود...');
          setTimeout(() => this.router.navigate(['/auth/login']), 2500);
        }
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'خطایی پیش آمده است.');
        this.otpDigits = ['', '', '', '', '', ''];
        this.isSubmitting.set(false);
      },
    });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true };
  }

  toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleShowConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  isInvalid(field: string): boolean {
    const c = this.resetForm.get(field);
    return !!(c && c.touched && c.invalid);
  }

  isValid(field: string): boolean {
    const c = this.resetForm.get(field);
    return !!(c && c.touched && c.valid && c.value);
  }

  hasMinLength(): boolean {
    return (this.resetForm.get('newPassword')?.value || '').length >= 8;
  }

  hasUpperCase(): boolean {
    return /[A-Z]/.test(this.resetForm.get('newPassword')?.value || '');
  }

  hasLowerCase(): boolean {
    return /[a-z]/.test(this.resetForm.get('newPassword')?.value || '');
  }

  hasNumber(): boolean {
    return /\d/.test(this.resetForm.get('newPassword')?.value || '');
  }

  get passwordStrength(): number {
    let score = 0;
    if (this.hasMinLength()) score++;
    if (this.hasUpperCase() && this.hasLowerCase()) score++;
    if (this.hasNumber()) score++;
    const val = this.resetForm.get('newPassword')?.value || '';
    if (/[^A-Za-z0-9]/.test(val)) score++;
    return score;
  }

  get strengthLabel(): string {
    switch (this.passwordStrength) {
      case 0: case 1: return 'ضعیف';
      case 2: return 'متوسط';
      case 3: return 'خوب';
      case 4: return 'عالی';
      default: return '';
    }
  }

  get strengthColor(): string {
    switch (this.passwordStrength) {
      case 1: return '#ef4444';
      case 2: return '#f59e0b';
      case 3: return '#3b82f6';
      case 4: return '#10b981';
      default: return '#e2e8f0';
    }
  }
}
