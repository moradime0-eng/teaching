import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, MatIconModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
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
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  public themeService = inject(ThemeService);
  private router = inject(Router);

  forgotForm: FormGroup;
  successMessage = signal('');
  errorMessage = signal('');
  isLoading = signal(false);

  constructor() {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit(): void {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.authService.forgotPassword(this.forgotForm.value.email).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          // Redirect to reset-password page with email in query params (same tab, no new window)
          const email = res.data?.email || this.forgotForm.value.email;
          this.router.navigate(['/auth/reset-password'], { queryParams: { email } });
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message || 'خطایی در ارسال ایمیل بازیابی رخ داد.');
      },
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  isInvalid(field: string): boolean {
    const c = this.forgotForm.get(field);
    return !!(c && c.touched && c.invalid);
  }

  isValid(field: string): boolean {
    const c = this.forgotForm.get(field);
    return !!(c && c.touched && c.valid && c.value);
  }
}
