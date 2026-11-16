import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TokenService } from '../../../core/services/token.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './callback.component.html',
  styleUrl: './callback.component.scss',
})
export class CallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private tokenService = inject(TokenService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);

  status = signal<'loading' | 'success' | 'error'>('loading');
  errorMessage = signal<string>('خطایی در فرایند احراز هویت پیش آمده است.');

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const params = this.route.snapshot.queryParams;
    const error = params['error'];
    const success = params['success'];

    if (error) {
      this.showError('ورود با گوگل توسط کاربر لغو شد یا با خطا مواجه گردید.');
      return;
    }

    if (!success) {
      this.router.navigate(['/auth/login'], {
        queryParams: { error: 'google_failed', reason: 'no_success_flag' },
      });
      return;
    }

    // ✅ کوکی‌ها توسط بک‌اند با path: '/' ست شده‌اند
    // فقط کافیست withCredentials: true فعال باشد (که در authInterceptor هست)
    this.tokenService.setAuthenticated(true);

    this.authService.loadUserProfile().subscribe({
      next: () => this.handleSuccess(),
      error: (err) => this.handleProfileError(err),
    });
  }

  private handleProfileError(err: any): void {
    if (err?.status === 401) {
      this.tokenService.clearTokens();
      this.router.navigate(['/auth/login'], {
        queryParams: { error: 'google_failed', reason: 'token_invalid' },
      });
      return;
    }

    this.showError('خطا در دریافت اطلاعات کاربری. لطفاً صفحه را مجدداً بارگذاری کنید.');
  }

  private handleSuccess(): void {
    this.status.set('success');
    setTimeout(() => {
      this.router.navigateByUrl('/', { replaceUrl: true });
    }, 1500);
  }

  private showError(msg: string): void {
    this.errorMessage.set(msg);
    this.status.set('error');
  }
}