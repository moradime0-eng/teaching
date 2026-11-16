import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  PaymentService,
  WalletSummary,
  WalletTransaction,
  WalletTransactionReason,
  WithdrawalBankInfo,
} from '../../../core/services/payment.service';
import { PaginationMeta } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/services/auth.service';
import { TomanPipe } from '../../../shared/pipes/toman.pipe';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';

type WalletTab = 'overview' | 'transactions' | 'topup' | 'withdraw';

/** حداقل مبلغ‌ها — هماهنگ با بک‌اند */
const MIN_TOPUP = 10000;
const MIN_WITHDRAWAL = 50000;

@Component({
  selector: 'app-wallet-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, TomanPipe, JalaliDatePipe],
  templateUrl: './wallet-dashboard.component.html',
  styleUrl: './wallet-dashboard.component.scss',
})
export class WalletDashboardComponent implements OnInit {
  private paymentService = inject(PaymentService);
  private authService = inject(AuthService);

  // State
  wallet: WalletSummary | null = null;
  transactions: WalletTransaction[] = [];
  meta: PaginationMeta | null = null;
  currentPage = 1;
  loading = true;
  txLoading = false;
  submitting = false;
  activeTab: WalletTab = 'overview';
  errorMessage = '';
  successMessage = '';

  // Topup form
  topupAmount: number | null = null;
  topupPresets = [100000, 200000, 500000, 1000000];

  // Withdraw form
  withdrawAmount: number | null = null;
  shebaNumber = '';
  cardNumber = '';
  accountHolder = '';

  /** فقط مدرس‌ها اجازه‌ی درخواست برداشت دارند (محدودیت پروژه) */
  get isInstructor(): boolean {
    return this.authService.isInstructor();
  }

  get totalPages(): number {
    return this.meta?.totalPages ?? 1;
  }

  ngOnInit(): void {
    this.loadWallet();
    this.loadTransactions(1);
  }

  setTab(tab: WalletTab): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
  }

  // ==================== Data ====================

  loadWallet(): void {
    this.loading = true;
    this.paymentService.getWalletSummary().subscribe({
      next: (summary) => {
        this.wallet = summary;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'خطا در دریافت اطلاعات کیف پول';
      },
    });
  }

  loadTransactions(page = 1): void {
    this.txLoading = true;
    this.paymentService.getWalletTransactions(page, 20).subscribe({
      next: (res) => {
        this.transactions = res.items;
        this.meta = res.meta;
        this.currentPage = res.meta.page || page;
        this.txLoading = false;
      },
      error: () => {
        this.txLoading = false;
        this.errorMessage = 'خطا در دریافت تاریخچه تراکنش‌ها';
      },
    });
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.loadTransactions(this.currentPage + 1);
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.loadTransactions(this.currentPage - 1);
    }
  }

  // ==================== Actions ====================

  selectTopupPreset(amount: number): void {
    this.topupAmount = amount;
  }

  onTopup(): void {
    const amount = Number(this.topupAmount);
    if (!Number.isInteger(amount) || amount < MIN_TOPUP) {
      this.errorMessage = 'حداقل مبلغ شارژ ۱۰,۰۰۰ تومان است';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.paymentService.topupWallet(amount).subscribe({
      next: (res) => {
        this.submitting = false;
        if (res?.gatewayUrl) {
          // هدایت به درگاه NikPal (بازگشت به همین اپ بعد از پرداخت)
          window.location.href = res.gatewayUrl;
        } else {
          this.errorMessage = 'خطا در دریافت آدرس درگاه پرداخت';
        }
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err?.error?.message || 'خطا در ایجاد درخواست شارژ';
      },
    });
  }

  onWithdraw(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const amount = Number(this.withdrawAmount);
    if (!Number.isInteger(amount) || amount < MIN_WITHDRAWAL) {
      this.errorMessage = 'حداقل مبلغ برداشت ۵۰,۰۰۰ تومان است';
      return;
    }

    const holder = this.accountHolder?.trim() || '';
    if (holder.length < 3) {
      this.errorMessage = 'نام صاحب حساب باید حداقل ۳ کاراکتر باشد';
      return;
    }

    const sheba = this.shebaNumber?.trim() || '';
    const card = this.cardNumber?.trim() || '';
    if (sheba && !/^IR\d{24}$/.test(sheba)) {
      this.errorMessage = 'شماره شبا باید با IR شروع شود و ۲۴ رقم داشته باشد';
      return;
    }
    if (card && !/^\d{16}$/.test(card)) {
      this.errorMessage = 'شماره کارت باید ۱۶ رقم باشد';
      return;
    }

    const bankInfo: WithdrawalBankInfo = {
      accountHolder: holder,
      ...(sheba ? { shebaNumber: sheba } : {}),
      ...(card ? { cardNumber: card } : {}),
    };

    this.submitting = true;
    this.paymentService.requestWithdrawal(amount, bankInfo).subscribe({
      next: () => {
        this.submitting = false;
        this.successMessage = 'درخواست برداشت ثبت شد و مبلغ تا بررسی، رزرو شد';
        // بازخوانی موجودی (کسر رزرو) + تاریخچه
        this.withdrawAmount = null;
        this.shebaNumber = '';
        this.cardNumber = '';
        this.accountHolder = '';
        this.loadWallet();
        this.loadTransactions(1);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMessage = err?.error?.message || 'خطا در ثبت درخواست برداشت';
      },
    });
  }

  // ==================== Helpers ====================

  reasonLabel(reason: WalletTransactionReason | string): string {
    const labels: Record<string, string> = {
      instructor_share: 'سهم مدرس',
      purchase: 'خرید دوره',
      topup: 'شارژ کیف پول',
      refund: 'بازپرداخت',
      withdrawal: 'برداشت وجه',
      admin_adjust: 'اصلاح توسط ادمین',
      rollback: 'بازگشت وجه',
    };
    return labels[reason] || reason;
  }
}
