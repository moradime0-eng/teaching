import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CartService } from '../../core/services/cart.service';
import { PaymentService } from '../../core/services/payment.service';
import { TomanPipe } from '../../shared/pipes/toman.pipe';
import { CartItem } from '../../core/models/cart.model';
import { Course } from '../../core/models/course.model';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, TomanPipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
})
export class CheckoutComponent implements OnInit {
  // Services
  public cartService = inject(CartService);
  private paymentService = inject(PaymentService);
  private router = inject(Router);

  // Payment state
  paymentMethod: 'nikpal' | 'wallet' = 'nikpal';
  isProcessing = false;

  // Coupon state
  couponCode = '';
  discount = signal(0);
  couponApplied = signal(false);
  errorMessage = '';

  // Wallet balance (ناموجود واقعی از GET /wallet — رفع هاردکد ۰)
  walletBalance = 0;
  hasWalletBalance = false;

  ngOnInit(): void {
    // اگر سبد خالی است، به صفحه سبد برگرد
    if (this.cartService.cartCount() === 0) {
      this.router.navigate(['/cart']);
      return;
    }

    // بارگذاری موجودی کیف پول (اختیاری)
    this.loadWalletBalance();
  }

  /**
   * بارگذاری موجودی واقعی کیف پول از GET /api/v1/wallet
   * (قبلاً هاردکد 0 بود و feature-detect روی متدی که اصلاً وجود نداشت — رفع شد)
   */
  private loadWalletBalance(): void {
    this.paymentService.getWalletSummary().subscribe({
      next: (summary) => {
        this.walletBalance = summary?.wallet?.balance ?? 0;
        this.hasWalletBalance = this.walletBalance >= this.getCalculatedPrice();
      },
      error: () => {
        // سرویس کیف پول در دسترس نیست — رفتار قبلی (غیرفعال بودن پرداخت کیف پولی)
        this.walletBalance = 0;
        this.hasWalletBalance = false;
      },
    });
  }

  /**
   * اعمال کد تخفیف
   */
  applyCoupon(): void {
    const code = this.couponCode?.trim();
    if (!code) return;

    this.errorMessage = '';

    this.paymentService.validateCoupon(code).subscribe({
      next: (res) => {
        if (res.success && res.data) {
          const discountVal = res.data.discountValue;
          this.couponApplied.set(true);
          this.errorMessage = '';

          if (res.data.discountType === 'percentage') {
            const calculated = Math.round(
              (this.cartService.totalPrice() * discountVal) / 100
            );
            this.discount.set(
              res.data.maxDiscount
                ? Math.min(calculated, res.data.maxDiscount)
                : calculated
            );
          } else {
            this.discount.set(discountVal);
          }
        } else {
          this.errorMessage = 'کد تخفیف نامعتبر است.';
        }
      },
      error: (err) => {
        this.errorMessage =
          err?.error?.message ||
          err?.message ||
          'کد تخفیف نامعتبر یا منقضی شده است.';
      },
    });
  }

  /**
   * حذف کد تخفیف اعمال شده
   */
  removeCoupon(): void {
    this.couponCode = '';
    this.discount.set(0);
    this.couponApplied.set(false);
    this.errorMessage = '';
  }

  /**
   * دریافت آبجکت Course از CartItem (نوع‌بندی امن)
   */
  getCourse(item: CartItem): Course | null {
    return typeof item.course === 'string' ? null : item.course;
  }

  /**
   * محاسبه مبلغ نهایی قابل پرداخت
   */
  getCalculatedPrice(): number {
    return Math.max(0, this.cartService.totalPrice() - this.discount());
  }

  /**
   * محاسبه درصد تخفیف اعمال شده
   */
  getDiscountPercent(): number {
    const total = this.cartService.totalPrice();
    if (!total || !this.discount()) return 0;
    return Math.round((this.discount() / total) * 100);
  }

  /**
   * آیا پرداخت از کیف پول مجاز است؟ (موجودی کافی + مبلغ نهایی بزرگ‌تر از صفر)
   */
  canPayWithWallet(): boolean {
    return (
      this.getCalculatedPrice() > 0 && this.walletBalance >= this.getCalculatedPrice()
    );
  }

  /**
   * کلیک روی گزینه‌ی پرداخت از کیف پول:
   * اگر موجودی برای پرداخت این سفارش کافی نباشد، کاربر به صفحه‌ی کیف پول
   * (برای شارژ) هدایت می‌شود — رادیو فقط در حالت موجودی کافی انتخاب می‌شود.
   */
  onWalletOptionClick(): void {
    if (this.getCalculatedPrice() > 0 && !this.canPayWithWallet()) {
      this.router.navigate(['/wallet']);
    }
  }

  /**
   * ارسال سفارش و انتقال به درگاه یا کیف پول
   */
  submitOrder(): void {
    const cart = this.cartService.cart();
    if (!cart || !cart.items?.length) {
      this.errorMessage = 'سبد خرید شما خالی است';
      return;
    }

    // بررسی موجودی کیف پول در صورت انتخاب wallet
    if (
      this.paymentMethod === 'wallet' &&
      this.getCalculatedPrice() > 0 &&
      !this.canPayWithWallet()
    ) {
      this.errorMessage = 'موجودی کیف پول شما کافی نیست';
      return;
    }

    this.isProcessing = true;
    this.errorMessage = '';

    const courseIds = cart.items.map(
      (item: any) => item.course._id || item.course
    );

    this.paymentService
      .createPayment({
        courseIds,
        paymentMethod:
          this.getCalculatedPrice() === 0 ? 'free' : this.paymentMethod,
        couponCode: this.couponApplied() ? this.couponCode : undefined,
      })
      .subscribe({
        next: (res) => {
          if (res.success) {
            if (
              this.paymentMethod === 'wallet' ||
              this.getCalculatedPrice() === 0
            ) {
              // پرداخت با کیف پول یا رایگان
              this.cartService.loadCart();
              this.isProcessing = false;
              this.router.navigate(['/dashboard/my-courses'], {
                queryParams: { success: 'true' },
              });
            } else if (res.data?.gatewayUrl) {
              // هدایت به درگاه NikPal
              window.location.href = res.data.gatewayUrl;
            } else {
              this.isProcessing = false;
              this.errorMessage = 'خطا در دریافت آدرس درگاه پرداخت';
            }
          } else {
            this.isProcessing = false;
            this.errorMessage = 'خطا در ایجاد پرداخت';
          }
        },
        error: (err) => {
          this.isProcessing = false;
          this.errorMessage =
            err?.error?.message ||
            err?.message ||
            'خطایی در فرآیند پرداخت رخ داد. لطفاً دوباره تلاش کنید.';
        },
      });
  }
}