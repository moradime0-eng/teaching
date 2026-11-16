import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse, PaginationMeta } from '../models/api-response.model';
import { environment } from '../../../environments/environment.development';

export interface CreatePaymentRequest {
  courseIds: string[];
  paymentMethod: 'nikpal' | 'zarinpal' | 'wallet' | 'free';
  couponCode?: string;
}

export interface CreatePaymentResponse {
  success: boolean;
  message?: string;
  data: {
    paymentId: string;
    orderNumber: string;
    finalAmount: number;
    gatewayUrl: string;
  };
}

export interface VerifyPaymentResponse {
  success: boolean;
  message?: string;
  data: {
    paymentId: string;
    orderNumber: string;
    status: string;
    amount: number;
    referenceId?: string;
  };
}

// ==================== کیف پول (Wallet) ====================

export type WalletTransactionReason =
  | 'instructor_share'
  | 'purchase'
  | 'topup'
  | 'refund'
  | 'withdrawal'
  | 'admin_adjust'
  | 'rollback';

export interface WalletBalances {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalSpent?: number;
}

export interface WalletTransaction {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  balanceAfter: number;
  reason: WalletTransactionReason;
  description?: string;
  relatedPayment?: string;
  relatedCourse?: string;
  createdAt: string;
}

/** پاسخ GET /api/v1/wallet */
export interface WalletSummary {
  wallet: WalletBalances;
  recentTransactions: WalletTransaction[];
}

/** پاسخ GET /api/v1/wallet/transactions (بعد از map شدن از envelope) */
export interface WalletTransactionsResult {
  items: WalletTransaction[];
  meta: PaginationMeta;
}

/** پاسخ POST /api/v1/wallet/topup */
export interface WalletTopupResponse {
  paymentId: string;
  orderNumber: string;
  finalAmount: number;
  gatewayUrl: string;
}

export interface WithdrawalBankInfo {
  shebaNumber?: string;
  cardNumber?: string;
  accountHolder: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  createPayment(data: CreatePaymentRequest): Observable<CreatePaymentResponse> {
    return this.http.post<CreatePaymentResponse>(`${this.apiUrl}/payments`, data);
  }

  verifyPayment(paymentId: string, status?: string): Observable<VerifyPaymentResponse> {
    return this.http.post<VerifyPaymentResponse>(`${this.apiUrl}/payments/verify`, {
      paymentId,
      ...(status ? { status } : {}),
    });
  }

  getUserPayments(page = 1, limit = 10): Observable<any> {
    return this.http.get(`${this.apiUrl}/payments/history?page=${page}&limit=${limit}`);
  }

  getPaymentDetails(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/payments/${id}`);
  }

  validateCoupon(code: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/coupons/validate`, { code });
  }

  // ==================== کیف پول (Wallet) ====================

  /** خلاصه‌ی کیف پول: موجودی + ۵ تراکنش آخر — GET /wallet */
  getWalletSummary(): Observable<WalletSummary> {
    return this.http
      .get<ApiResponse<WalletSummary>>(`${this.apiUrl}/wallet`)
      .pipe(map((res) => res.data as WalletSummary));
  }

  /** صورت حساب صفحه‌بندی‌شده — GET /wallet/transactions */
  getWalletTransactions(page = 1, limit = 20): Observable<WalletTransactionsResult> {
    return this.http
      .get<ApiResponse<WalletTransaction[]>>(
        `${this.apiUrl}/wallet/transactions?page=${page}&limit=${limit}`,
      )
      .pipe(
        map((res) => ({
          items: res.data ?? [],
          meta: res.meta ?? { page, limit, total: 0, totalPages: 0 },
        })),
      );
  }

  /** شارژ کیف پول از درگاه — POST /wallet/topup → gatewayUrl برای ریدایرکت */
  topupWallet(amount: number): Observable<WalletTopupResponse> {
    return this.http
      .post<ApiResponse<WalletTopupResponse>>(`${this.apiUrl}/wallet/topup`, { amount })
      .pipe(map((res) => res.data as WalletTopupResponse));
  }

  /** درخواست برداشت — POST /wallet/withdraw (حداقل ۵۰,۰۰۰ تومان در سرور) */
  requestWithdrawal(
    amount: number,
    bankInfo: WithdrawalBankInfo,
  ): Observable<{ amount: number }> {
    return this.http
      .post<ApiResponse<{ amount: number }>>(`${this.apiUrl}/wallet/withdraw`, {
        amount,
        bankInfo,
      })
      .pipe(map((res) => res.data as { amount: number }));
  }

  /** بازپرداخت ادمین — سرویس واحد refund.service در بک‌اند */
  adminRefund(paymentId: string, reason: string): Observable<any> {
    return this.http
      .post<ApiResponse<any>>(`${this.apiUrl}/payments/admin/${paymentId}/refund`, { reason })
      .pipe(map((res) => res.data));
  }
}