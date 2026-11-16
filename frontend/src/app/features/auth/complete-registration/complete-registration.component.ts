import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TokenService } from '../../../core/services/token.service';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { User } from '../../../core/models/user.model';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-complete-registration',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './complete-registration.component.html',
  styleUrl: './complete-registration.component.scss',
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
export class CompleteRegistrationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tokenService = inject(TokenService);
  private authService = inject(AuthService);
  public themeService = inject(ThemeService);
  private platformId = inject(PLATFORM_ID);

  status = signal<'loading' | 'form' | 'submitting' | 'success' | 'error'>('loading');
  errorMessage = signal('');
  selectedRole = signal<'student' | 'instructor'>('student');
  userInfo = signal<{ fullName: string; email: string; avatar?: string } | null>(null);

  // Multi-step: 'role' then 'password'
  currentStep = signal<'role' | 'password'>('role');
  password = signal('');
  confirmPassword = signal('');
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  passwordError = signal('');

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const params = this.route.snapshot.queryParams;
    // Backend sets httpOnly cookies during OAuth — just mark as authenticated
    this.tokenService.setAuthenticated(true);

    this.authService.loadUserProfile().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const user = response.data as User;
          this.userInfo.set({
            fullName: user.fullName,
            email: user.email,
            avatar: user.avatar,
          });

          if (user.isProfileComplete) {
            this.router.navigateByUrl('/', { replaceUrl: true });
            return;
          }

          this.status.set('form');
        }
      },
      error: () => {
        this.tokenService.clearTokens();
        this.router.navigate(['/auth/login'], { queryParams: { error: 'profile_load_failed' } });
      },
    });
  }

  selectRole(role: 'student' | 'instructor'): void {
    this.selectedRole.set(role);
  }

  // Step 1: Role → go to password step
  onRoleSubmit(): void {
    if (!this.selectedRole()) return;
    this.currentStep.set('password');
    this.errorMessage.set('');
  }

  // Step 2: Password → submit everything
  onPasswordSubmit(): void {
    this.passwordError.set('');
    const pwd = this.password();
    const confirm = this.confirmPassword();

    if (!pwd || pwd.length < 8) {
      this.passwordError.set('رمز عبور باید حداقل ۸ کاراکتر باشد');
      return;
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pwd)) {
      this.passwordError.set('رمز عبور باید شامل حرف بزرگ، کوچک و عدد باشد');
      return;
    }

    if (pwd !== confirm) {
      this.passwordError.set('رمز عبور و تکرار آن مطابقت ندارند');
      return;
    }

    this.status.set('submitting');
    this.errorMessage.set('');

    this.authService.completeRegistration(this.selectedRole(), pwd, confirm).subscribe({
      next: (response) => {
        if (response.success) {
          this.status.set('success');
          setTimeout(() => {
            this.router.navigateByUrl('/', { replaceUrl: true });
          }, 1500);
        }
      },
      error: (err) => {
        this.status.set('form');
        this.currentStep.set('password');
        this.errorMessage.set(
          err?.error?.message || 'خطا در تکمیل ثبت‌نام. لطفاً دوباره تلاش کنید.',
        );
      },
    });
  }

  toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  toggleShowConfirmPassword(): void {
    this.showConfirmPassword.update((v) => !v);
  }

  goBackToRole(): void {
    this.currentStep.set('role');
    this.passwordError.set('');
    this.errorMessage.set('');
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
