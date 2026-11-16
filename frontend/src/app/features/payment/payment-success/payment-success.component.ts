import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { PaymentService } from '../../../core/services/payment.service';

export interface PaymentDetail {
  orderNumber: string;
  finalAmount: number;
  paidAt: string;
  status: string;
  courses?: { title: string }[];
}

type ViewState = 'loading' | 'success' | 'error' | 'no-data';

@Component({
  selector: 'app-payment-success',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payment-success.component.html',
  styleUrls: ['./payment-success.component.scss'],
})
export class PaymentSuccessComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private paymentService = inject(PaymentService);
  private destroy$ = new Subject<void>();

  paymentDetails: PaymentDetail | null = null;
  viewState: ViewState = 'loading';
  copiedField: string | null = null;

  ngOnInit(): void {
    const paymentId = this.route.snapshot.queryParamMap.get('paymentId');

    if (!paymentId) {
      this.viewState = 'no-data';
      return;
    }

    this.paymentService
      .getPaymentDetails(paymentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.paymentDetails = res.data ?? res;
          this.viewState = 'success';
        },
        error: () => {
          this.viewState = 'error';
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  copyToClipboard(value: string, field: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.copiedField = field;
      setTimeout(() => (this.copiedField = null), 2000);
    });
  }

  retry(): void {
    this.viewState = 'loading';
    const paymentId = this.route.snapshot.queryParamMap.get('paymentId');
    if (!paymentId) {
      this.viewState = 'no-data';
      return;
    }
    this.paymentService
      .getPaymentDetails(paymentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.paymentDetails = res.data ?? res;
          this.viewState = 'success';
        },
        error: () => {
          this.viewState = 'error';
        },
      });
  }
}