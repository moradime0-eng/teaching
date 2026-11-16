import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { trigger, transition, style, animate } from '@angular/animations';
import { environment } from '../../../../environments/environment.development';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate(
          '300ms cubic-bezier(0.16, 1, 0.3, 1)',
          style({ opacity: 1, transform: 'translateY(0)' }),
        ),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' })),
      ]),
    ]),
  ],
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  public authService = inject(AuthService);
  public themeService = inject(ThemeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loginForm: FormGroup;
  showPassword = signal(false);
  errorMessage = signal('');
  rememberMe = signal(false);

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit(): void {
    // 🆕 بررسی خطای ورود با گوگل یا گیت‌هاب در پارامترهای URL
    const error = this.route.snapshot.queryParams['error'];
    const reason = this.route.snapshot.queryParams['reason'];

    if (error === 'google_failed') {
      console.warn('[Google Login] Failure reason from server:', reason);
      this.errorMessage.set(
        reason
          ? `ورود با گوگل ناموفق بود: ${decodeURIComponent(reason)}`
          : 'ورود با گوگل ناموفق بود یا توسط کاربر لغو شد.',
      );
    } else if (error === 'github_failed') {
      this.errorMessage.set('ورود با گیت‌هاب ناموفق بود یا توسط کاربر لغو شد.');
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.authService.login(this.loginForm.value).subscribe({
      next: (res) => {
        if (res.success) {
          const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
          this.router.navigateByUrl(returnUrl);
        }
      },
      error: (err) => {
        // نمایش کامل خطاهای بک‌اند
        if (err?.error?.errors && Array.isArray(err.error.errors)) {
          this.errorMessage.set(err.error.errors.map((e: any) => e.msg || e.message).join(' • '));
        } else {
          this.errorMessage.set(
            err?.error?.message || err?.message || 'ایمیل یا رمز عبور اشتباه است.',
          );
        }
      },
    });
  }

  loginWithGoogle(): void {
    window.location.href = `${environment.apiUrl}/auth/google`;
  }

  loginWithGithub(): void {
    window.location.href = `${environment.apiUrl}/auth/github`;
  }

  isInvalid(field: string): boolean {
    const c = this.loginForm.get(field);
    return !!(c && c.touched && c.invalid);
  }

  isValid(field: string): boolean {
    const c = this.loginForm.get(field);
    return !!(c && c.touched && c.valid && c.value);
  }
}
