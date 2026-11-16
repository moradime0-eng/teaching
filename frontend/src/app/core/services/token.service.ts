import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const USER_KEY = 'current_user';
const ACCESS_TOKEN_KEY = 'access_token';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private _isAuthenticated = false;

  isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  setAuthenticated(value: boolean): void {
    this._isAuthenticated = value;
  }

  setUser(user: any): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  }

  getUser(): any {
    if (!this.isBrowser) return null;
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  clearUser(): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(USER_KEY);
  }

  clearTokens(): void {
    this._isAuthenticated = false;
    this.clearUser();
    if (this.isBrowser) {
      try {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      } catch {}
    }
  }

  getAccessToken(): string | null {
    if (!this.isBrowser) return null;
    try {
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setAccessToken(token: string): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {}
  }

  getRefreshToken(): string | null {
    return null;
  }

  setTokens(accessToken: string, _refreshToken: string): void {
    if (accessToken) {
      this.setAccessToken(accessToken);
    }
  }

  getUserRole(): string | null {
    const user = this.getUser();
    return user?.role || null;
  }
}
