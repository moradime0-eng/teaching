import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

export interface ErrorInfo {
  code: string;
  title: string;
  description: string;
  suggestion: string;
}

@Component({
  selector: 'app-payment-failure',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './payment-failure.component.html',
  styleUrls: ['./payment-failure.component.scss'],
})
export class PaymentFailureComponent implements OnInit {
  private route = inject(ActivatedRoute);

  rawErrorCode = '';
  errorInfo: ErrorInfo | null = null;
  copiedField: string | null = null;
  showDetails = false;

  private readonly errorMap: Record<string, Omit<ErrorInfo, 'code'>> = {
    INSUFFICIENT_FUNDS: {
      title: 'موجودی ناکافی',
      description: 'موجودی حساب بانکی شما برای انجام این تراکنش کافی نیست.',
      suggestion: 'لطفاً موجودی حساب خود را بررسی کرده و مجدداً تلاش کنید.',
    },
    CARD_DECLINED: {
      title: 'کارت بانکی رد شد',
      description: 'بانک صادرکننده کارت، این تراکنش را تأیید نکرد.',
      suggestion: 'با بانک خود تماس بگیرید یا از کارت دیگری استفاده کنید.',
    },
    EXPIRED_CARD: {
      title: 'کارت منقضی‌شده',
      description: 'تاریخ انقضای کارت بانکی شما به پایان رسیده است.',
      suggestion: 'لطفاً از کارت معتبر دیگری استفاده کنید.',
    },
    INCORRECT_PIN: {
      title: 'رمز اشتباه',
      description: 'رمز دوم (پویا) واردشده نادرست است.',
      suggestion: 'رمز پویای جدید دریافت کرده و دوباره تلاش کنید.',
    },
    TIMEOUT: {
      title: 'اتمام زمان تراکنش',
      description: 'مهلت انجام تراکنش به پایان رسیده است.',
      suggestion: 'لطفاً دوباره تلاش کنید و فرآیند پرداخت را سریع‌تر تکمیل نمایید.',
    },
    DUPLICATE: {
      title: 'تراکنش تکراری',
      description: 'این تراکنش قبلاً ثبت شده است.',
      suggestion: 'اگر مبلغی کسر شده، طی ۷۲ ساعت به حساب شما بازمی‌گردد.',
    },
    GATEWAY_ERROR: {
      title: 'خطای درگاه پرداخت',
      description: 'درگاه بانکی در حال حاضر در دسترس نیست.',
      suggestion: 'چند دقیقه صبر کنید و مجدداً تلاش کنید.',
    },
    CANCELLED: {
      title: 'لغو توسط کاربر',
      description: 'شما فرآیند پرداخت را لغو کردید.',
      suggestion: 'هر زمان که آماده بودید، می‌توانید دوباره اقدام به پرداخت کنید.',
    },
  };

  private readonly defaultError: Omit<ErrorInfo, 'code'> = {
    title: 'پرداخت ناموفق',
    description: 'متأسفانه پرداخت شما انجام نشد. ممکن است مشکل از سمت درگاه بانکی یا شبکه باشد.',
    suggestion: 'لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
  };

  ngOnInit(): void {
    this.rawErrorCode =
      this.route.snapshot.queryParamMap.get('error') ?? '';

    const mapped = this.errorMap[this.rawErrorCode.toUpperCase()];
    this.errorInfo = {
      code: this.rawErrorCode,
      ...(mapped ?? this.defaultError),
    };
  }

  copyToClipboard(value: string, field: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.copiedField = field;
      setTimeout(() => (this.copiedField = null), 2000);
    });
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
  }
}