import { Component, Input, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type CategoryIconType = 'material' | 'emoji' | 'google' | 'custom';

/**
 * بررسی اینکه آیا متن ورودی شامل کاراکتر ایموجی است یا خیر
 */
function isEmojiString(str?: string | null): boolean {
  if (!str) return false;
  const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
  return emojiRegex.test(str);
}

@Component({
  selector: 'app-category-icon',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container [ngSwitch]="resolvedType">
      <!-- 1. Custom Uploaded Image (PNG/SVG/WebP) -->
      <img
        *ngSwitchCase="'custom'"
        [src]="customIconUrl"
        [alt]="alt || icon || 'icon'"
        class="ci-img"
        loading="lazy"
        (error)="onImageError()"
      />

      <!-- 2. Material Icon -->
      <mat-icon
        *ngSwitchCase="'material'"
        class="ci-mat-icon"
        aria-hidden="true"
      >
        {{ icon || fallback }}
      </mat-icon>

      <!-- 3. Emoji -->
      <span
        *ngSwitchCase="'emoji'"
        class="ci-emoji"
        role="img"
        [attr.aria-label]="alt || icon"
      >
        {{ icon }}
      </span>

      <!-- Fallback Icon -->
      <mat-icon
        *ngSwitchDefault
        class="ci-mat-icon"
        aria-hidden="true"
      >
        {{ fallback }}
      </mat-icon>
    </ng-container>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: transparent !important;
      line-height: 1;
    }

    /* استایل عکس‌های آپلودی شفاف - بدون هیچ‌گونه کادر یا پس‌زمینه مربعی */
    .ci-img {
      display: block;
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      object-position: center;
      background: transparent !important;
      border: none !important;
      border-radius: 0 !important;
      outline: none !important;
      box-shadow: none !important;
      user-select: none;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.12));
      transition: transform 0.3s ease, filter 0.3s ease;
    }

    .ci-mat-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      font-size: inherit;
      color: currentColor;
    }

    .ci-emoji {
      font-size: inherit;
      line-height: 1;
      display: inline-block;
      user-select: none;
    }
  `]
})
export class CategoryIconComponent {
  @Input() icon?: string | null;
  @Input() iconType?: CategoryIconType | string | null;
  @Input() customIconUrl?: string | null;
  @Input() size: number = 64;
  @Input() alt: string = '';
  @Input() fallback: string = 'auto_awesome';

  /** سیگنال ثبت وضعیت شکست بارگذاری عکس (نام اصلی مورد نیاز تسک) */
  readonly imgFailed = signal<boolean>(false);

  /** نام قدیمی سیگنال — برای سازگاری با تست‌های موجود حفظ شده است */
  readonly imageFailed = this.imgFailed;

  /**
   * محاسبه‌ی هوشمند نوع آیکون (تشخیص بین Material، Emoji، Custom و Fallback)
   */
  get resolvedType(): CategoryIconType {
    // ۱. اگر بارگذاری عکس با خطا مواجه شده باشد، آیکون به Material تغییر می‌کند
    if (this.imgFailed()) {
      return 'material';
    }

    // ۲. اگر iconType صریحاً توسط کاربر مقداردهی شده باشد
    if (this.iconType) {
      if (this.iconType === 'google') return 'material';
      return this.iconType as CategoryIconType;
    }

    // ۳. اگر لینک عکس سفارشی وجود داشته باشد
    if (this.customIconUrl) {
      return 'custom';
    }

    // ۴. تشخیص خودکار ایموجی در صورت وجود کاراکتر ایموجی در icon
    if (this.icon && isEmojiString(this.icon)) {
      return 'emoji';
    }

    // ۵. حالت پیش‌فرض
    return 'material';
  }

  /**
   * متد هندل خطا هنگام لود نشدن عکس (با نام دقیق مورد نیاز Unit Test)
   */
  onImageError(): void {
    this.imgFailed.set(true);
  }
}