import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { User } from '../../../core/models/user.model';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

interface RoleFilter {
  value: string;
  label: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    PaginationComponent,
    JalaliDatePipe,
    ImageFallbackDirective,
    RichTextEditorComponent,
  ],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
})
export class AdminUsersComponent implements OnInit {
  users = signal<User[]>([]);
  isLoading = signal<boolean>(true);
  searchQuery = signal<string>('');
  roleFilter = signal<string>('');
  statusFilter = signal<string>('all');
  currentPage = signal<number>(1);
  totalPages = signal<number>(1);
  totalUsers = signal<number>(0);

  // Ban modal
  showBanModal = signal<boolean>(false);
  selectedUser = signal<any>(null);
  banReason = signal<string>('');
  processingId = signal<string | null>(null);

  // Stats
  countStudents = signal<number>(0);
  countInstructors = signal<number>(0);
  countAdmins = signal<number>(0);
  countBanned = signal<number>(0);

  roleFilters: RoleFilter[] = [
    { value: '', label: 'همه کاربران', icon: 'group', color: 'indigo' },
    { value: 'student', label: 'دانشجو', icon: 'school', color: 'blue' },
    { value: 'instructor', label: 'مدرس', icon: 'co_present', color: 'purple' },
    { value: 'admin', label: 'مدیر', icon: 'admin_panel_settings', color: 'red' },
  ];

  statusFilters = [
    { value: 'all', label: 'همه وضعیت‌ها' },
    { value: 'active', label: 'فعال' },
    { value: 'banned', label: 'مسدود' },
  ];

  banReasons = [
    'تخلف از قوانین سایت',
    'ارسال محتوای نامناسب',
    'سوءاستفاده از سیستم',
    'رفتار نامناسب با کاربران',
    'سایر موارد',
  ];

  private searchTimeout: any;

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadStats();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    const params: any = {
      page: this.currentPage(),
      limit: 20,
    };

    if (this.searchQuery()) params.search = this.searchQuery();
    if (this.roleFilter()) params.role = this.roleFilter();
    if (this.statusFilter() === 'banned') params.isBanned = true;
    if (this.statusFilter() === 'active') params.isBanned = false;

    this.api.getPaginated<User>('/users', params).subscribe({
      next: (res) => {
        if (res.data) this.users.set(res.data);
        if (res.meta) {
          this.totalPages.set(res.meta.totalPages || 1);
          this.totalUsers.set(res.meta.total || res.data?.length || 0);
        } else {
          this.totalUsers.set(res.data?.length || 0);
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  loadStats(): void {
    // Lightweight counts — adjust endpoints if your API differs
    ['student', 'instructor', 'admin'].forEach((role) => {
      this.api.getPaginated<User>('/users', { role, limit: 1 }).subscribe({
        next: (res: any) => {
          const total = res.meta?.total || res.total || 0;
          if (role === 'student') this.countStudents.set(total);
          if (role === 'instructor') this.countInstructors.set(total);
          if (role === 'admin') this.countAdmins.set(total);
        },
      });
    });

    this.api.getPaginated<User>('/users', { isBanned: true, limit: 1 }).subscribe({
      next: (res: any) => {
        this.countBanned.set(res.meta?.total || res.total || 0);
      },
    });
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadUsers();
    }, 400);
  }

  setRoleFilter(role: string): void {
    this.roleFilter.set(role);
    this.currentPage.set(1);
    this.loadUsers();
  }

  setStatusFilter(status: string): void {
    this.statusFilter.set(status);
    this.currentPage.set(1);
    this.loadUsers();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadUsers();
  }

  // ── Ban / Unban ──────────────────────────────────────────
  openBanModal(user: any): void {
    this.selectedUser.set(user);
    this.banReason.set('');
    this.showBanModal.set(true);
  }

  closeBanModal(): void {
    this.showBanModal.set(false);
    this.selectedUser.set(null);
    this.banReason.set('');
  }

  confirmBan(): void {
    const user = this.selectedUser();
    const reason = this.banReason().trim();
    if (!user || !reason || reason.length < 3) return;

    this.processingId.set(user._id);
    this.api.put<any>(`/users/${user._id}/ban`, { reason }).subscribe({
      next: () => {
        this.processingId.set(null);
        this.closeBanModal();
        this.loadUsers();
        this.loadStats();
      },
      error: () => this.processingId.set(null),
    });
  }

  unbanUser(user: any): void {
    this.processingId.set(user._id);
    this.api.put<any>(`/users/${user._id}/unban`, {}).subscribe({
      next: () => {
        this.processingId.set(null);
        this.loadUsers();
        this.loadStats();
      },
      error: () => this.processingId.set(null),
    });
  }

  // ── Helpers ──────────────────────────────────────────────
  getRoleLabel(role: string): string {
    const map: Record<string, string> = {
      student: 'دانشجو',
      instructor: 'مدرس',
      admin: 'مدیر',
    };
    return map[role] || role;
  }

  getRoleIcon(role: string): string {
    const map: Record<string, string> = {
      student: 'school',
      instructor: 'co_present',
      admin: 'admin_panel_settings',
    };
    return map[role] || 'person';
  }

  getInitials(name: string): string {
    if (!name) return 'ک';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : parts[0][0];
  }

  getStatusInfo(user: any): { label: string; color: string; icon: string } {
    if (user.isBanned) {
      return { label: 'مسدود', color: 'red', icon: 'block' };
    }
    if (user.isActive !== false) {
      return { label: 'فعال', color: 'green', icon: 'check_circle' };
    }
    return { label: 'غیرفعال', color: 'slate', icon: 'pause_circle' };
  }

  totalAllUsers = computed(
    () => this.countStudents() + this.countInstructors() + this.countAdmins(),
  );

  get skeletonArray(): number[] {
    return Array(6)
      .fill(0)
      .map((_, i) => i);
  }

  trackByUser(index: number, user: any): string {
    return user._id || index.toString();
  }
}
