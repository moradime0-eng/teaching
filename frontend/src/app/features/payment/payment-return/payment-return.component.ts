import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, switchMap, of, catchError, timer } from 'rxjs';
import { PaymentService } from '../../../core/services/payment.service';

// ── Types ─────────────────────────────────────
export type ReturnPhase = 'working' | 'success' | 'error' | 'nothing';

export interface VerificationStep {
  label: string;
  state: 'pending' | 'active' | 'done';
}

interface PaymentRecord {
  _id: string;
  status: string;
  gatewayAuthority?: string;
  createdAt?: string;
}

// ── Component ─────────────────────────────────
@Component({
  selector: 'app-payment-return',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payment-return.component.html',
  styleUrls: ['./payment-return.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentReturnComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private paymentService = inject(PaymentService);
  private destroy$ = new Subject<void>();

  phase: ReturnPhase = 'working';
  message = '';
  countdown = 3;

  steps: VerificationStep[] = [
    { label: 'اتصال به درگاه پرداخت', state: 'active' },
    { label: 'تأیید اطلاعات تراکنش', state: 'pending' },
    { label: 'انتقال به صفحه نتیجه', state: 'pending' },
  ];

  // ── Lifecycle ─────────────────────────────
  ngOnInit(): void {
    this.verify();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Public ────────────────────────────────
  retry(): void {
    this.resetState();
    this.verify();
  }

  // ── Core Logic ────────────────────────────
  private verify(): void {
    this.advanceStep(0);

    this.paymentService
      .getUserPayments(1, 10)
      .pipe(
        takeUntil(this.destroy$),
        switchMap((res: any) => {
          this.advanceStep(1);
          const payments: PaymentRecord[] = Array.isArray(res?.data)
            ? res.data
            : [];

          const pending = payments.find(
            (
              p,
            ): p is PaymentRecord & { gatewayAuthority: string } =>
              !!p?.gatewayAuthority && p.status === 'pending',
          );

          if (pending) {
            return this.paymentService
              .verifyPayment(pending.gatewayAuthority)
              .pipe(
                switchMap(() => {
                  this.advanceStep(2);
                  return of({ action: 'redirect' as const, id: pending._id });
                }),
                catchError((err: any) =>
                  of({
                    action: 'error' as const,
                    msg:
                      err?.error?.message ||
                      'تأیید پرداخت با خطا مواجه شد؛ لطفاً دوباره تلاش کنید.',
                  }),
                ),
              );
          }

          // No pending — check if a recent success already exists
          const latest = payments[0];
          const isRecent =
            latest?.createdAt &&
            Date.now() - new Date(latest.createdAt).getTime() <
              24 * 60 * 60 * 1000;

          if (latest?.status === 'success' && isRecent) {
            this.advanceStep(2);
            return of({ action: 'redirect' as const, id: latest._id });
          }

          return of({ action: 'nothing' as const });
        }),
      )
      .subscribe({
        next: (result) => {
          switch (result.action) {
            case 'redirect':
              this.onSuccess(result.id);
              break;
            case 'error':
              this.phase = 'error';
              this.message = result.msg;
              break;
            case 'nothing':
              this.phase = 'nothing';
              break;
          }
        },
        error: () => {
          this.phase = 'error';
          this.message =
            'دریافت تاریخچه پرداخت‌ها ممکن نشد؛ لطفاً دوباره تلاش کنید.';
        },
      });
  }

  // ── Helpers ───────────────────────────────
  private onSuccess(paymentId: string): void {
    this.phase = 'success';
    this.countdown = 3;

    timer(1000, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          this.router.navigate(['/payment/success'], {
            queryParams: { paymentId },
          });
        }
      });
  }

  private advanceStep(index: number): void {
    this.steps = this.steps.map((s, i) => ({
      ...s,
      state: i < index ? 'done' : i === index ? 'active' : 'pending',
    }));
  }

  private resetState(): void {
    this.phase = 'working';
    this.message = '';
    this.countdown = 3;
    this.steps = this.steps.map((s, i) => ({
      ...s,
      state: i === 0 ? 'active' : 'pending',
    }));
  }
}