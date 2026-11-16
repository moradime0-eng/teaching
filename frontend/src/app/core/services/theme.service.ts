import { Injectable, signal, effect, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  currentTheme = signal<Theme>(this.getSavedTheme());

  constructor() {
    if (this.isBrowser) {
      effect(() => {
        const theme = this.currentTheme();
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.classList.toggle('dark', theme === 'dark');
      });

      // Follow OS theme changes while the user has not manually picked a theme
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        const manualTheme = localStorage.getItem('theme');
        if (!manualTheme) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  toggleTheme(): void {
    this.currentTheme.update((t) => {
      const next: Theme = t === 'light' ? 'dark' : 'light';
      if (this.isBrowser) {
        localStorage.setItem('theme', next);
      }
      return next;
    });
  }

  setTheme(theme: Theme): void {
    // Does not persist: persistence marks a manual choice and blocks OS changes
    this.currentTheme.set(theme);
  }

  isDark(): boolean {
    return this.currentTheme() === 'dark';
  }

  private getSavedTheme(): Theme {
    if (this.isBrowser) {
      const saved = localStorage.getItem('theme') as Theme;
      if (saved) return saved;
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    return 'light';
  }
}
