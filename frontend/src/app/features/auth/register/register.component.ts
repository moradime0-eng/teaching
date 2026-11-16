import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { environment } from '../../../../environments/environment.development';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
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
    trigger('stepChange', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(30px)' }),
        animate('400ms cubic-bezier(0.16, 1, 0.3, 1)', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
    ]),
  ],
})
export class RegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  public themeService = inject(ThemeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Step management — 3 steps: Email → Password → Role+Name
  currentStep = signal<1 | 2 | 3>(1);
  selectedRole = signal<'student' | 'instructor' | 'admin'>('student');
  isFirstUser = signal(false);

  // Form state
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  isSubmitting = signal(false);

  // Step 1: Email
  emailForm: FormGroup;

  // Step 2: Password
  passwordForm: FormGroup;

  // Step 3: Role + Name
  roleForm: FormGroup;

  constructor() {
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });

    this.passwordForm = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );

    this.roleForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      role: ['student', [Validators.required]],
    });
  }

  ngOnInit(): void {
    // پیش‌انتخاب نقش از query param (مثلاً /auth/register?role=instructor)
    const presetRole = this.route.snapshot.queryParamMap.get('role');
    if (presetRole === 'instructor' || presetRole === 'student') {
      this.selectedRole.set(presetRole);
      this.roleForm.patchValue({ role: presetRole });
    }

    this.authService.checkFirstUser().subscribe({
      next: (res) => {
        if (res.success && res.data?.isFirstUser) {
          this.isFirstUser.set(true);
          this.selectedRole.set('admin');
          this.roleForm.patchValue({ role: 'admin' });
        }
      },
    });
  }

  // ==================== Step 1: Email ====================
  onEmailNext(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.errorMessage.set('');
    this.currentStep.set(2);
  }

  loginWithGoogle(): void {
    const apiBase = environment.apiUrl.replace('/api/v1', '');
    window.location.href = `${apiBase}/api/v1/auth/google`;
  }

  loginWithGithub(): void {
    const apiBase = environment.apiUrl.replace('/api/v1', '');
    window.location.href = `${apiBase}/api/v1/auth/github`;
  }

  // ==================== Step 2: Password ====================
  onPasswordNext(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.errorMessage.set('');
    this.currentStep.set(3);
  }

  // ==================== Step 3: Role Selection ====================
  selectRole(role: 'student' | 'instructor' | 'admin'): void {
    this.selectedRole.set(role);
    this.roleForm.patchValue({ role });
  }

  onSubmit(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');
    this.isSubmitting.set(true);

    const { role, fullName } = this.roleForm.value;
    const email = this.emailForm.get('email')?.value;
    const { password, confirmPassword } = this.passwordForm.value;

    this.authService.register({ fullName, email, password, confirmPassword, role }).subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage.set('🎉 ثبت‌نام با موفقیت انجام شد!');
          setTimeout(() => {
            this.router.navigate([role === 'instructor' ? '/instructor/dashboard' : '/']);
          }, 1500);
        }
        this.isSubmitting.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'خطایی پیش آمده است.');
        this.isSubmitting.set(false);
      },
    });
  }

  // ==================== Navigation ====================
  goBack(): void {
    const step = this.currentStep();
    if (step > 1) {
      this.currentStep.set((step - 1) as any);
      this.errorMessage.set('');
    }
  }

  // ==================== Helpers ====================
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleShowConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true };
  }

  isInvalid(form: FormGroup, field: string): boolean {
    const c = form.get(field);
    return !!(c && c.touched && c.invalid);
  }

  isValid(form: FormGroup, field: string): boolean {
    const c = form.get(field);
    return !!(c && c.touched && c.valid && c.value);
  }

  hasMinLength(): boolean {
    const val = this.passwordForm.get('password')?.value || '';
    return val.length >= 8;
  }

  hasUpperCase(): boolean {
    const val = this.passwordForm.get('password')?.value || '';
    return /[A-Z]/.test(val);
  }

  hasLowerCase(): boolean {
    const val = this.passwordForm.get('password')?.value || '';
    return /[a-z]/.test(val);
  }

  hasNumber(): boolean {
    const val = this.passwordForm.get('password')?.value || '';
    return /\d/.test(val);
  }

  get passwordStrength(): number {
    let score = 0;
    if (this.hasMinLength()) score++;
    if (this.hasUpperCase() && this.hasLowerCase()) score++;
    if (this.hasNumber()) score++;
    const val = this.passwordForm.get('password')?.value || '';
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
