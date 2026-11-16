import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment.development';
import { TokenService } from './token.service';
import {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
} from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private router = inject(Router);

  private apiUrl = `${environment.apiUrl}/auth`;
  private userApiUrl = `${environment.apiUrl}/users`;

  private currentUserSignal = signal<User | null>(null);
  private isAuthenticatedSignal = signal<boolean>(false);
  private isLoadingSignal = signal<boolean>(false);

  currentUser = this.currentUserSignal.asReadonly();
  isAuthenticated = this.isAuthenticatedSignal.asReadonly();
  isLoading = this.isLoadingSignal.asReadonly();

  userRole = computed(() => this.currentUserSignal()?.role || null);
  isAdmin = computed(() => this.currentUserSignal()?.role === 'admin');
  isInstructor = computed(() => this.currentUserSignal()?.role === 'instructor');
  isStudent = computed(() => this.currentUserSignal()?.role === 'student');
  userName = computed(() => this.currentUserSignal()?.fullName || 'کاربر مهمان');

  userAvatar = computed(() => {
    const user = this.currentUserSignal();
    if (!user) return null;
    return user.avatar || (user as any).profileImage || (user as any).photo || null;
  });

  isEmailVerified = computed(() => this.currentUserSignal()?.isEmailVerified || false);

  /** Cache profile fetch to avoid redundant API calls */
  private lastProfileFetch = 0;
  private readonly PROFILE_CACHE_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.checkAuthStatus();
  }

  private checkAuthStatus(): void {
    const storedUser = this.tokenService.getUser();
    if (storedUser) {
      // Optimistically set user from localStorage — the interceptor will
      // handle 401s and token refresh. Don't clear on profile fetch failure
      // because the interceptor is already managing auth state.
      this.tokenService.setAuthenticated(true);
      this.currentUserSignal.set(storedUser);
      this.isAuthenticatedSignal.set(true);
      // Only fetch profile if cache expired
      const now = Date.now();
      if (now - this.lastProfileFetch > this.PROFILE_CACHE_MS) {
        this.lastProfileFetch = now;
        this.loadUserProfile().subscribe();
      }
    }
  }

  login(credentials: LoginRequest): Observable<ApiResponse<{ user: User } & AuthTokens>> {
    this.isLoadingSignal.set(true);
    return this.http
      .post<ApiResponse<{ user: User } & AuthTokens>>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.tokenService.setAuthenticated(true);
            this.tokenService.setUser(response.data.user);

            // ذخیره توکن‌ها به صورت کلاینت ساید جهت استفاده در اتصالات سوکت
            if (response.data.accessToken) {
              this.tokenService.setTokens(
                response.data.accessToken,
                response.data.refreshToken || '',
              );
            }

            this.currentUserSignal.set(response.data.user);
            this.isAuthenticatedSignal.set(true);
          }
          this.isLoadingSignal.set(false);
        }),
        catchError((error) => {
          this.isLoadingSignal.set(false);
          return throwError(() => error);
        }),
      );
  }

  register(data: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    role: string;
  }): Observable<ApiResponse<{ user: User } & AuthTokens>> {
    this.isLoadingSignal.set(true);
    return this.http
      .post<ApiResponse<{ user: User } & AuthTokens>>(`${this.apiUrl}/register`, data)
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.tokenService.setAuthenticated(true);
            this.tokenService.setUser(response.data.user);

            if (response.data.accessToken) {
              this.tokenService.setTokens(
                response.data.accessToken,
                response.data.refreshToken || '',
              );
            }

            this.currentUserSignal.set(response.data.user);
            this.isAuthenticatedSignal.set(true);
          }
          this.isLoadingSignal.set(false);
        }),
        catchError((error) => {
          this.isLoadingSignal.set(false);
          return throwError(() => error);
        }),
      );
  }

  checkFirstUser(): Observable<ApiResponse<{ isFirstUser: boolean }>> {
    return this.http.get<ApiResponse<{ isFirstUser: boolean }>>(`${this.apiUrl}/check-first-user`);
  }

  logout(): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/logout`, {}).pipe(
      tap(() => {
        this.clearLocalSession();
      }),
      catchError(() => {
        this.clearLocalSession();
        return throwError(() => new Error('خروج با موفقیت انجام شد.'));
      }),
    );
  }

  private clearLocalSession(): void {
    this.tokenService.clearTokens();
    this.currentUserSignal.set(null);
    this.isAuthenticatedSignal.set(false);
    this.router.navigate(['/']);
  }

  setUser(user: User): void {
    this.tokenService.setAuthenticated(true);
    this.tokenService.setUser(user);
    this.currentUserSignal.set(user);
    this.isAuthenticatedSignal.set(true);
  }

  completeRegistration(
    role: string,
    password: string,
    confirmPassword?: string,
  ): Observable<ApiResponse<{ user: User } & AuthTokens>> {
    return this.http
      .post<ApiResponse<{ user: User } & AuthTokens>>(`${this.apiUrl}/complete-registration`, {
        role,
        password,
        confirmPassword: confirmPassword || password,
      })
      .pipe(
        tap((response) => {
          if (response.success && response.data) {
            this.tokenService.setAuthenticated(true);
            this.tokenService.setUser(response.data.user);

            if (response.data.accessToken) {
              this.tokenService.setTokens(
                response.data.accessToken,
                response.data.refreshToken || '',
              );
            }

            this.currentUserSignal.set(response.data.user);
            this.isAuthenticatedSignal.set(true);
          }
        }),
      );
  }

  refreshToken(): Observable<ApiResponse<AuthTokens>> {
    return this.http.post<ApiResponse<AuthTokens>>(`${this.apiUrl}/refresh-token`, {}).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.tokenService.setAuthenticated(true);
          if (response.data.accessToken) {
            this.tokenService.setTokens(
              response.data.accessToken,
              response.data.refreshToken || '',
            );
          }
        }
      }),
    );
  }

  loadUserProfile(): Observable<ApiResponse<User>> {
    return this.http.get<ApiResponse<User>>(`${this.userApiUrl}/profile`).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.currentUserSignal.set(response.data);
          this.isAuthenticatedSignal.set(true);
        }
      }),
      catchError((error) => {
        // ⚠️ Do NOT clear tokens here — the authInterceptor handles 401
        // by refreshing tokens. Clearing here causes a race condition
        // where tokens are wiped before the retry can succeed.
        // Only clear if the interceptor already navigated to login
        // (which it does when refresh fails).
        if (error.status === 401 || error.status === 403) {
          // Let the interceptor handle auth failures
          return throwError(() => error);
        }
        // For non-auth errors, still clear (e.g., server down)
        this.tokenService.clearTokens();
        this.currentUserSignal.set(null);
        this.isAuthenticatedSignal.set(false);
        return throwError(() => error);
      }),
    );
  }

  updateProfile(data: UpdateProfileRequest): Observable<ApiResponse<User>> {
    return this.http.put<ApiResponse<User>>(`${this.userApiUrl}/profile`, data).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.currentUserSignal.set(response.data);
        }
      }),
    );
  }

  uploadAvatar(file: File): Observable<ApiResponse<any>> {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.http.post<ApiResponse<any>>(`${this.userApiUrl}/upload-avatar`, formData).pipe(
      tap((response) => {
        if (response.success && response.data) {
          const newAvatar = response.data.avatar || response.data.user?.avatar || response.data.url;
          if (newAvatar) {
            this.currentUserSignal.update((current) => {
              if (!current) return current;
              return { ...current, avatar: newAvatar };
            });
          }
        }
      }),
    );
  }

  forgotPassword(email: string): Observable<ApiResponse<{ email: string }>> {
    return this.http.post<ApiResponse<{ email: string }>>(`${this.apiUrl}/forgot-password`, {
      email,
    });
  }

  resetPassword(
    email: string,
    otpCode: string,
    newPassword: string,
    confirmPassword: string,
  ): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/reset-password`, {
      email,
      otpCode,
      newPassword,
      confirmPassword,
    });
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string,
  ): Observable<ApiResponse<null>> {
    return this.http.post<ApiResponse<null>>(`${this.apiUrl}/change-password`, {
      currentPassword,
      newPassword,
      confirmNewPassword,
    });
  }
}
