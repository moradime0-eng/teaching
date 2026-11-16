import { Component, OnInit, OnDestroy, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { ApiService } from '../../../core/services/api.service';
import { Campaign } from '../../../core/models/campaign.model';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { filter } from 'rxjs/operators';
import moment from 'jalali-moment';

/** تبدیل تاریخ میلادی به جلالی با فرمت مشخص */
function jalaliDate(value: string | Date | null | undefined, format: string): string {
  if (!value) return '';
  const m = moment(value).locale('fa');
  return m.isValid() ? m.format(format) : '';
}

type FilterStatus = 'all' | 'active' | 'scheduled' | 'expired' | 'inactive';
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-campaigns-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    ConfirmModalComponent,
    PaginationComponent,
  ],
  templateUrl: './campaigns-list.component.html',
  styleUrl: './campaigns-list.component.scss',
})
export class CampaignsListComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  campaigns = signal<Campaign[]>([]);
  isLoading = signal(true);
  error = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  showConfirmModal = signal(false);
  campaignToDelete = signal<Campaign | null>(null);

  // Pagination
  currentPage = signal(1);
  totalPages = signal(1);
  totalCampaigns = signal(0);
  readonly pageSize = 12;

  // Filters & View
  searchQuery = signal('');
  activeFilter = signal<FilterStatus>('all');
  viewMode = signal<ViewMode>('grid');

  private routerSub: any;

  // Live clock for countdowns
  now = signal(Date.now());
  private clockInterval?: any;

  // Computed: filtered campaigns (server-side filtering already applied)
  filteredCampaigns = computed(() => this.campaigns());

  // Statistics — loaded from /campaigns/stats so counters cover ALL campaigns
  stats = signal<{
    total: number;
    active: number;
    scheduled: number;
    expired: number;
  }>({ total: 0, active: 0, scheduled: 0, expired: 0 });

  private searchTimeout?: any;

  ngOnInit(): void {
    this.loadCampaigns();
    this.loadStats();

    // ⚠️ SSR-SAFE: در Node نباید setInterval ساخته شود، وگرنه Zone هرگز stable نمی‌شود
    // و رندر SSR با TimeoutError می‌افتد.
    if (isPlatformBrowser(this.platformId)) {
      this.clockInterval = setInterval(() => this.now.set(Date.now()), 1000);
    }

    // Reload campaigns when navigating back to this route
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        if (
          event.urlAfterRedirects === '/admin/campaigns' ||
          event.urlAfterRedirects.startsWith('/admin/campaigns?')
        ) {
          this.loadCampaigns();
          this.loadStats();
        }
      });
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.routerSub) this.routerSub.unsubscribe();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
  }

  loadCampaigns(): void {
    this.isLoading.set(true);
    this.error.set(null);

    const params: Record<string, any> = {
      page: this.currentPage(),
      limit: this.pageSize,
    };

    // Server-side status filter
    const status = this.activeFilter();
    if (status !== 'all') {
      params['status'] = status;
    }

    // Server-side search
    const search = this.searchQuery().trim();
    if (search) {
      params['search'] = search;
    }

    // ⚠️ FIX: API returns the array directly in `data` (not `data.items`)
    this.api.getPaginated<Campaign>('/campaigns', params).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.campaigns.set(res.data);
        } else {
          this.campaigns.set([]);
        }

        if (res.meta) {
          // ⚠️ FIX: totalPages can be 0 when there are no results — keep it at least 1
          const pages = Math.max(res.meta.totalPages || 0, 1);
          this.totalPages.set(pages);
          this.totalCampaigns.set(res.meta.total || 0);

          // ⚠️ FIX: current page may be out of range (e.g. last item deleted)
          // → jump back to the last valid page
          if (this.currentPage() > pages) {
            this.currentPage.set(pages);
            this.loadCampaigns();
            return;
          }
        } else {
          this.totalPages.set(1);
          this.totalCampaigns.set(this.campaigns().length);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'خطا در بارگذاری کمپین‌ها');
        this.campaigns.set([]);
        this.isLoading.set(false);
      },
    });
  }

  loadStats(): void {
    this.api
      .get<{
        total: number;
        active: number;
        scheduled: number;
        expired: number;
        inactive: number;
      }>('/campaigns/stats')
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.stats.set({
              total: res.data.total || 0,
              active: res.data.active || 0,
              scheduled: res.data.scheduled || 0,
              expired: res.data.expired || 0,
            });
          }
        },
        error: () => {
          // Fallback: derive stats from the currently loaded page
          const all = this.campaigns();
          this.stats.set({
            total: this.totalCampaigns() || all.length,
            active: all.filter((c) => this.getCampaignStatus(c) === 'active').length,
            scheduled: all.filter((c) => this.getCampaignStatus(c) === 'scheduled').length,
            expired: all.filter((c) => this.getCampaignStatus(c) === 'expired').length,
          });
        },
      });
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadCampaigns();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  getCampaignStatus(campaign: Campaign): FilterStatus {
    if (!campaign.isActive) return 'inactive';
    const now = this.now();
    const startAt = new Date(campaign.startAt).getTime();
    const endAt = new Date(campaign.endAt).getTime();
    if (now < startAt) return 'scheduled';
    if (now > endAt) return 'expired';
    return 'active';
  }

  getStatusMeta(campaign: Campaign): { label: string; class: string; icon: string } {
    const status = this.getCampaignStatus(campaign);
    const map = {
      active: { label: 'فعال', class: 'status-active', icon: 'bolt' },
      scheduled: { label: 'زمان‌بندی شده', class: 'status-scheduled', icon: 'schedule' },
      expired: { label: 'منقضی شده', class: 'status-expired', icon: 'history' },
      inactive: { label: 'غیرفعال', class: 'status-inactive', icon: 'pause_circle' },
      all: { label: '-', class: '', icon: '' },
    };
    return map[status];
  }

  getRemainingTime(
    campaign: Campaign,
  ): { days: number; hours: number; mins: number; secs: number; total: number } | null {
    const status = this.getCampaignStatus(campaign);
    if (status !== 'active') return null;
    const endAt = new Date(campaign.endAt).getTime();
    const diff = endAt - this.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    return { days, hours, mins, secs, total: diff };
  }

  getTimeUntilStart(campaign: Campaign): string | null {
    const status = this.getCampaignStatus(campaign);
    if (status !== 'scheduled') return null;
    const startAt = new Date(campaign.startAt).getTime();
    const diff = startAt - this.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    if (days > 0) return `${days} روز و ${hours} ساعت دیگر`;
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    if (hours > 0) return `${hours} ساعت و ${mins} دقیقه دیگر`;
    return `${mins} دقیقه دیگر`;
  }

  getProgressPercent(campaign: Campaign): number {
    const start = new Date(campaign.startAt).getTime();
    const end = new Date(campaign.endAt).getTime();
    const now = this.now();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  }

  getScopeLabel(campaign: Campaign): string {
    if (campaign.scope === 'all') return 'همه دوره‌ها';
    return `${campaign.categories?.length || 0} دسته‌بندی`;
  }

  /**
   * ⚠️ واحد پول داخلی = تومان (همه مدل‌ها/UI).
   * قبلاً `/ 10` اعمال می‌شد که ۱۰ برابر کمتر نشان می‌داد.
   */
  getDiscountLabel(campaign: Campaign): string {
    if (campaign.discountType === 'percentage') return `${campaign.discountValue}٪`;
    return `${campaign.discountValue.toLocaleString('fa-IR')} ت`;
  }

  /**
   * سقف تخفیف — ذخیره‌شده به ریال در بک‌اند، نمایش به تومان.
   */
  getMaxDiscountToman(campaign: Campaign): number {
    return Math.round((campaign.maxDiscount || 0) / 10);
  }

  getThemeIcon(theme: string): string {
    switch (theme) {
      case 'fire':
        return 'local_fire_department';
      case 'cold':
        return 'ac_unit';
      case 'gold':
        return 'workspace_premium';
      case 'green':
        return 'eco';
      default:
        return 'local_fire_department';
    }
  }

  getThemeLabel(theme: string): string {
    switch (theme) {
      case 'fire':
        return 'آتشین';
      case 'cold':
        return 'سرد';
      case 'gold':
        return 'طلایی';
      case 'green':
        return 'سبز';
      default:
        return 'آتشین';
    }
  }

  /**
   * ⚠️ تاریخ‌ها به تقویم جلالی نمایش داده می‌شوند (هماهنگ با پروژه).
   * `toLocaleDateString('fa-IR')` تاریخ میلادی با اعداد فارسی برمی‌گرداند.
   */
  formatDate(dateString: string): string {
    return jalaliDate(dateString, 'YYYY/MM/DD');
  }

  formatTime(dateString: string): string {
    return jalaliDate(dateString, 'HH:mm');
  }

  setFilter(filter: FilterStatus): void {
    if (this.activeFilter() === filter) return;
    this.activeFilter.set(filter);
    this.currentPage.set(1);
    this.loadCampaigns();
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadCampaigns();
    }, 350);
  }

  clearSearch(): void {
    clearTimeout(this.searchTimeout);
    this.searchQuery.set('');
    this.currentPage.set(1);
    this.loadCampaigns();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  editCampaign(campaign: Campaign): void {
    this.router.navigate(['/admin/campaigns', campaign._id, 'edit']);
  }

  confirmDelete(campaign: Campaign): void {
    this.campaignToDelete.set(campaign);
    this.showConfirmModal.set(true);
  }

  deleteCampaign(): void {
    const campaign = this.campaignToDelete();
    if (!campaign) return;
    this.deletingId.set(campaign._id);
    this.api.delete(`/campaigns/${campaign._id}`).subscribe({
      next: (res) => {
        if (res.success) {
          this.showConfirmModal.set(false);
          this.campaignToDelete.set(null);
          // Reload to fix pagination (last item on a page may be removed)
          this.loadCampaigns();
          this.loadStats();
        }
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  cancelDelete(): void {
    this.showConfirmModal.set(false);
    this.campaignToDelete.set(null);
  }

  toggleActive(campaign: Campaign): void {
    this.api
      .put<Campaign>(`/campaigns/${campaign._id}`, { isActive: !campaign.isActive })
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.campaigns.update((list) =>
              list.map((c) => (c._id === campaign._id ? res.data! : c)),
            );
            // Status may have changed → the item may no longer match the active filter
            this.loadStats();
            if (this.activeFilter() !== 'all') {
              this.loadCampaigns();
            }
          }
        },
      });
  }

  duplicateCampaign(campaign: Campaign): void {
    this.router.navigate(['/admin/campaigns/new'], { queryParams: { duplicate: campaign._id } });
  }

  createNew(): void {
    this.router.navigate(['/admin/campaigns/new']);
  }

  // ✅ متد جدید: بازگشت به داشبورد ادمین
  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  trackByCampaignId(_: number, c: Campaign): string {
    return c._id;
  }
}
