import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TenantService } from '../../../core/services/tenant.service';

@Component({
  selector: 'app-tenant-switcher',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatMenuModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './tenant-switcher.component.html',
  styleUrl: './tenant-switcher.component.scss',
})
export class TenantSwitcherComponent implements OnInit {
  private router = inject(Router);
  private tenantService = inject(TenantService);

  currentTenantId = this.tenantService.currentTenantId;
  currentTenant = this.tenantService.currentTenant;
  userMemberships = this.tenantService.userMemberships;
  availableTenants = this.tenantService.availableTenants;

  currentTenantName = computed(() => {
    return this.currentTenant()?.name || 'انتخاب آموزشگاه';
  });

  currentTenantRole = computed(() => {
    const currentId = this.currentTenantId();
    const membership = this.availableTenants().find((t) => t.tenantId === currentId);
    return membership?.role || '';
  });

  ngOnInit(): void {
    this.tenantService.loadUserMemberships();
  }

  switchTenant(tenantId: string): void {
    if (tenantId !== this.currentTenantId()) {
      this.tenantService.switchTenant(tenantId);
    }
  }

  getTenantInitial(name: string): string {
    if (!name) return '🏢';
    return name.trim().charAt(0).toUpperCase();
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      owner: 'مالک',
      admin: 'مدیر',
      instructor: 'مدرس',
      student: 'دانشجو',
    };
    return labels[role] || role;
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }
}
