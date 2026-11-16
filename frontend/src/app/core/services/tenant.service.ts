import { Injectable, signal, effect, computed, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment.development';
import { TokenService } from './token.service';

export interface TenantBranding {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  logo: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  isActive: boolean;
}

export interface UserMembership {
  tenantId: string;
  tenantName: string;
  role: 'owner' | 'admin' | 'instructor' | 'student';
  status: 'active' | 'pending' | 'suspended' | 'rejected';
}

@Injectable({ providedIn: 'root' })
export class TenantService {
  // Current tenant branding (for theming)
  currentTenant = signal<TenantBranding | null>(null);

  // Current tenant ID (for API calls)
  currentTenantId = signal<string | null>(null);

  // User's memberships across tenants
  userMemberships = signal<UserMembership[]>([]);

  // Computed: available tenants for switching
  availableTenants = computed(() => this.userMemberships().filter((m) => m.status === 'active'));

  private tokenService = inject(TokenService);
  private isBrowser: boolean;

  constructor(private http: HttpClient) {
    this.isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    if (!this.isBrowser) return; // ✅ SSR-safe: در سرور هیچ کاری نکن

    // Try loading from sessionStorage first to avoid HTTP call on every page
    const cached = this.loadFromSessionStorage();
    if (cached) {
      this.currentTenant.set(cached);
      this.currentTenantId.set(cached.id);
    } else {
      this.resolveTenantBranding();
    }

    // Apply branding CSS variables automatically
    effect(() => {
      const tenant = this.currentTenant();
      if (tenant) {
        document.title = `${tenant.name} | پلتفرم آموزش آنلاین`;
        const root = document.documentElement;
        root.style.setProperty('--primary-color', tenant.primaryColor);
        root.style.setProperty('--primary-dark', tenant.secondaryColor);
        root.style.setProperty('--font-family', tenant.fontFamily);

        // Update logo text globally
        const logoIcon = document.querySelector('.logo-text');
        if (logoIcon) logoIcon.innerHTML = tenant.name;
      }
    });
  }

  /** Load tenant branding from sessionStorage cache */
  private loadFromSessionStorage(): TenantBranding | null {
    try {
      const cached = sessionStorage.getItem('tenant_branding');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return null;
  }

  /** Save tenant branding to sessionStorage */
  private saveToSessionStorage(tenant: TenantBranding): void {
    try {
      sessionStorage.setItem('tenant_branding', JSON.stringify(tenant));
    } catch {}
  }

  /**
   * Resolve tenant branding from hostname (subdomain or custom domain)
   */
  private resolveTenantBranding(): void {
    if (typeof window === 'undefined') return;

    const host = window.location.host;

    this.http.get<any>(`${environment.apiUrl}/tenant/branding?host=${host}`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const tenantData = res.data;
          const branding: TenantBranding = {
            id: tenantData._id,
            name: tenantData.name,
            subdomain: tenantData.subdomain,
            customDomain: tenantData.customDomain,
            logo: tenantData.logo || '/assets/images/logo.png',
            favicon: tenantData.favicon,
            primaryColor: tenantData.branding.primaryColor,
            secondaryColor: tenantData.branding.secondaryColor,
            fontFamily: tenantData.branding.fontFamily,
            isActive: tenantData.isActive,
          };
          this.currentTenant.set(branding);
          this.currentTenantId.set(tenantData._id);
          this.saveToSessionStorage(branding);
        }
      },
      error: () => {
        // Load default values if tenant not found
        this.currentTenant.set({
          id: 'default',
          name: 'آموزش همایون',
          subdomain: 'iranian-udemy',
          logo: '/assets/images/logo.png',
          primaryColor: '#a435f0',
          secondaryColor: '#1c1d1f',
          fontFamily: 'Vazirmatn',
          isActive: true,
        });
        this.currentTenantId.set('default');
      },
    });
  }

  /**
   * Load user's memberships (call after login)
   */
  loadUserMemberships(): void {
    // Only load if authenticated (tokens are in httpOnly cookies)
    if (!this.isBrowser || !this.tokenService.isAuthenticated()) return;

    this.http.get<any>(`${environment.apiUrl}/users/memberships`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.userMemberships.set(res.data);
        }
      },
      error: (err) => {
        console.error('Failed to load user memberships:', err);
      },
    });
  }

  /**
   * Switch active tenant
   * @param tenantId - Target tenant ID
   */
  switchTenant(tenantId: string): void {
    const membership = this.userMemberships().find((m) => m.tenantId === tenantId);
    if (!membership) {
      console.error('User is not a member of this tenant');
      return;
    }

    // Update current tenant
    this.http.get<any>(`${environment.apiUrl}/tenant/branding?tenantId=${tenantId}`).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const tenantData = res.data;
          this.currentTenant.set({
            id: tenantData._id,
            name: tenantData.name,
            subdomain: tenantData.subdomain,
            customDomain: tenantData.customDomain,
            logo: tenantData.logo || '/assets/images/logo.png',
            favicon: tenantData.favicon,
            primaryColor: tenantData.branding.primaryColor,
            secondaryColor: tenantData.branding.secondaryColor,
            fontFamily: tenantData.branding.fontFamily,
            isActive: tenantData.isActive,
          });
          this.currentTenantId.set(tenantData._id);

          // Reload page to refresh all data with new tenant context
          window.location.reload();
        }
      },
      error: (err) => {
        console.error('Failed to switch tenant:', err);
      },
    });
  }

  /**
   * Get current tenant ID for API calls
   */
  getTenantId(): string | null {
    return this.currentTenantId();
  }

  /**
   * Check if user can access a tenant
   */
  canAccessTenant(tenantId: string): boolean {
    return this.userMemberships().some((m) => m.tenantId === tenantId && m.status === 'active');
  }

  /**
   * Get user's role in current tenant
   */
  getCurrentTenantRole(): string | null {
    const tenantId = this.currentTenantId();
    if (!tenantId) return null;

    const membership = this.userMemberships().find((m) => m.tenantId === tenantId);
    return membership?.role || null;
  }

  /**
   * Check if user has specific role in current tenant
   */
  hasRoleInCurrentTenant(roles: string[]): boolean {
    const role = this.getCurrentTenantRole();
    return role ? roles.includes(role) : false;
  }
}
