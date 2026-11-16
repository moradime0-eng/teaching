import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../core/services/api.service';
import { PaymentService } from '../../../core/services/payment.service';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

interface PaymentStatus {
  value: string;
  label: string;
  icon: string;
  color: string;
}

interface PaymentMethod {
  value: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    TomanPipe,
    JalaliDatePipe,
    ImageFallbackDirective,
  ],
  templateUrl: './admin-payments.component.html',
  styleUrl: './admin-payments.component.scss',
})
export class AdminPaymentsComponent implements OnInit {
  payments = signal<any[]>([]);
  isLoading = signal<boolean>(true);
  searchQuery = signal<string>('');
  statusFilter = signal<string>('all');
  methodFilter = signal<string>('all');
  selectedPayment = signal<any>(null);
  showDetailModal = signal<boolean>(false);
  copiedCode = signal<string | null>(null);
  refundingId = signal<string | null>(null);

  // Pagination
  currentPage = signal<number>(1);
  pageSize = signal<number>(15);
  totalCount = signal<number>(0);

  statusList: PaymentStatus[] = [
    { value: 'all', label: 'همه تراکنش‌ها', icon: 'receipt_long', color: 'indigo' },
    { value: 'success', label: 'موفق', icon: 'check_circle', color: 'green' },
    { value: 'pending', label: 'در انتظار', icon: 'schedule', color: 'amber' },
    { value: 'failed', label: 'ناموفق', icon: 'cancel', color: 'red' },
    { value: 'reversed', label: 'برگشت خورده', icon: 'replay', color: 'purple' },
    { value: 'refunded', label: 'بازپرداخت‌شده', icon: 'assignment_return', color: 'purple' },
    { value: 'expired', label: 'منقضی', icon: 'timer_off', color: 'gray' },
  ];

  methodList: PaymentMethod[] = [
    { value: 'all', label: 'همه روش‌ها', icon: 'tune' },
    { value: 'nikpal', label: 'NikPal', icon: 'credit_card' },
    { value: 'wallet', label: 'کیف پول', icon: 'account_balance_wallet' },
    { value: 'card', label: 'کارت به کارت', icon: 'payment' },
    { value: 'online', label: 'درگاه آنلاین', icon: 'language' },
  ];

  constructor(private api: ApiService, private paymentService: PaymentService) {}

  ngOnInit(): void {
    this.loadPayments();
  }

  loadPayments(): void {
    this.isLoading.set(true);
    const params: any = {
      page: this.currentPage(),
      limit: this.pageSize(),
    };

    if (this.statusFilter() !== 'all') {
      params.status = this.statusFilter();
    }
    // NOTE: بک‌اند فیلتر paymentMethod پشتیبانی نمی‌کند — حذف شد.

    this.api.getPaginated<any>('/payments/admin/all', params).subscribe({
      next: (res) => {
        if (res.data) {
          this.payments.set(res.data);
          this.totalCount.set(res.total || res.pagination?.total || res.data.length);
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  setStatusFilter(status: string): void {
    this.statusFilter.set(status);
    this.currentPage.set(1);
    this.loadPayments();
  }

  setMethodFilter(method: string): void {
    // فیلتر روش پرداخت در سمت کلاینت اعمال می‌شود
    // (بک‌اند پارامتر paymentMethod را پشتیبانی نمی‌کند)
    this.methodFilter.set(method);
    this.currentPage.set(1);
  }

  openDetail(payment: any): void {
    this.selectedPayment.set(payment);
    this.showDetailModal.set(true);
  }

  closeDetail(): void {
    this.showDetailModal.set(false);
    this.selectedPayment.set(null);
  }

  copyCode(code: string): void {
    if (!code) return;
    navigator.clipboard.writeText(code);
    this.copiedCode.set(code);
    setTimeout(() => this.copiedCode.set(null), 2000);
  }

  // Statistics calculation
  stats = computed(() => {
    const items = this.payments();
    const totalAmount = items
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum + (p.finalAmount || p.amount || 0), 0);

    const successCount = items.filter((p) => p.status === 'success').length;
    const pendingCount = items.filter((p) => p.status === 'pending').length;
    const failedCount = items.filter((p) => p.status === 'failed').length;

    return {
      totalAmount,
      successCount,
      pendingCount,
      failedCount,
    };
  });

  // Client-side Filtered Payments
  filteredPayments = computed(() => {
    let list = this.payments();
    const query = this.searchQuery().trim().toLowerCase();

    if (query) {
      list = list.filter(
        (p) =>
          p.orderNumber?.toLowerCase().includes(query) ||
          p.refId?.toLowerCase().includes(query) ||
          p.user?.fullName?.toLowerCase().includes(query) ||
          p.user?.email?.toLowerCase().includes(query) ||
          p.user?.mobile?.includes(query),
      );
    }

    // فیلتر روش پرداخت (client-side)
    if (this.methodFilter() !== 'all') {
      list = list.filter((p) => p.paymentMethod === this.methodFilter());
    }

    return list;
  });

  /**
   * بازپرداخت تراکنش موفق — فراخوانی سرویس واحد بازپرداخت بک‌اند
   * (نرم‌کردن ثبت‌نام، کسر سهم مدرس، بازگشت پول/علامت‌گذاری REFUND_PENDING)
   */
  refundPayment(paymentId: string): void {
    const reason = window.prompt('دلیل بازپرداخت (حداقل ۵ کاراکتر):');
    if (reason === null) return; // لغو
    if (reason.trim().length < 5) {
      window.alert('دلیل بازپرداخت باید حداقل ۵ کاراکتر باشد');
      return;
    }

    this.refundingId.set(paymentId);
    this.paymentService.adminRefund(paymentId, reason.trim()).subscribe({
      next: () => {
        this.refundingId.set(null);
        window.alert('بازپرداخت با موفقیت پردازش شد');
        this.loadPayments();
      },
      error: (err) => {
        this.refundingId.set(null);
        window.alert(err?.error?.message || 'خطا در بازپرداخت');
      },
    });
  }

  getStatusLabel(status: string): string {
    const found = this.statusList.find((s) => s.value === status);
    return found ? found.label : status;
  }

  getStatusIcon(status: string): string {
    const found = this.statusList.find((s) => s.value === status);
    return found ? found.icon : 'help_outline';
  }

  getMethodLabel(method: string): string {
    const found = this.methodList.find((m) => m.value === method);
    return found ? found.label : method || 'آنلاین';
  }

  exportToCsv(): void {
    const items = this.filteredPayments();
    if (!items.length) return;

    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF';
    csvContent += 'شماره سفارش,مبلغ (تومان),روش پرداخت,وضعیت,کد پیگیری,کاربر,تاریخ\n';

    items.forEach((p) => {
      const row = [
        p.orderNumber || '-',
        p.finalAmount || p.amount || 0,
        this.getMethodLabel(p.paymentMethod),
        this.getStatusLabel(p.status),
        p.refId || '-',
        p.user?.fullName || '-',
        p.createdAt || '-',
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `payments_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  get skeletonArray(): number[] {
    return Array(6)
      .fill(0)
      .map((_, i) => i);
  }

  trackByPaymentId(index: number, payment: any): string {
    return payment._id || payment.orderNumber || index.toString();
  }
}
