import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../core/services/cart.service';
import { TomanPipe } from '../../shared/pipes/toman.pipe';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    TomanPipe,
    ImageFallbackDirective,
  ],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
})
export class CartComponent implements OnInit {
  couponCode = signal<string>('');
  isApplyingCoupon = signal<boolean>(false);
  couponError = signal<string>('');
  couponSuccess = signal<string>('');
  removingId = signal<string | null>(null);
  showCouponInput = signal<boolean>(false);
  isLoading = signal<boolean>(true);

  constructor(public cartService: CartService) {}

  ngOnInit(): void {
    this.isLoading.set(true);
    this.cartService.loadCart().subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false),
    });
  }

  removeItem(courseId: string): void {
    this.removingId.set(courseId);
    this.cartService.removeFromCart(courseId).subscribe({
      next: () => this.removingId.set(null),
      error: () => this.removingId.set(null),
    });
  }

  getCourseDetail(item: any): any {
    return item.course || {};
  }

  // ⭐ قیمت زنده هر آیتم (شامل تخفیف زمان‌دار)
  getItemCurrentPrice(item: any): number {
    const course = item.course || {};
    if (course.isFree) return 0;

    if (course.pricing?.currentPrice !== undefined) {
      return course.pricing.currentPrice;
    }

    if (course.currentPrice !== undefined && course.currentPrice > 0) {
      return course.currentPrice;
    }

    if (course.discountPrice && course.discountPrice > 0) {
      return course.discountPrice;
    }

    if (item.priceAtAdd !== undefined && item.priceAtAdd > 0) {
      return item.priceAtAdd;
    }

    return course.price || 0;
  }

  // ⭐ درصد تخفیف زنده هر آیتم
  getItemDiscountPercent(item: any): number {
    const course = item.course || {};
    if (course.isFree) return 0;

    if (course.pricing?.currentDiscountPercent !== undefined && course.pricing.currentDiscountPercent > 0) {
      return course.pricing.currentDiscountPercent;
    }

    if (course.discountPercentage !== undefined && course.discountPercentage > 0) {
      return course.discountPercentage;
    }

    if (course.discountPrice && course.price && course.discountPrice < course.price) {
      return Math.round(((course.price - course.discountPrice) / course.price) * 100);
    }

    return 0;
  }

  hasItemOldPrice(item: any): boolean {
    const course = item.course || {};
    if (course.isFree) return false;
    return this.getItemDiscountPercent(item) > 0 && this.getItemCurrentPrice(item) < (course.price || 0);
  }

  applyCoupon(): void {
    const code = this.couponCode().trim();
    if (!code) return;

    this.isApplyingCoupon.set(true);
    this.couponError.set('');
    this.couponSuccess.set('');

    this.cartService.applyCoupon(code).subscribe({
      next: () => {
        this.couponSuccess.set('کد تخفیف معتبر است — در مرحله پرداخت اعمال می‌شود');
        this.isApplyingCoupon.set(false);
        this.couponCode.set('');
      },
      error: (err: any) => {
        this.couponError.set(err?.error?.message || 'کد تخفیف نامعتبر است');
        this.isApplyingCoupon.set(false);
      },
    });
  }

  toggleCouponInput(): void {
    this.showCouponInput.update((v) => !v);
    if (!this.showCouponInput()) {
      this.couponCode.set('');
      this.couponError.set('');
      this.couponSuccess.set('');
    }
  }

  // ⭐ سیگنال‌های نال‌امید
  finalPrice = computed(() => this.cartService.cart()?.finalPrice ?? 0);
  totalPrice = computed(() => this.cartService.totalPrice() ?? 0);
  couponDiscountAmount = computed(() => this.cartService.cart()?.discountAmount ?? 0);

  courseDiscountAmount = computed(() => {
    const total = this.totalPrice();
    const finalP = this.finalPrice();
    const couponDisc = this.couponDiscountAmount();
    // تخفیف واقعی خود دوره‌ها بدون احتساب کوپن
    return Math.max(0, total - finalP - couponDisc);
  });

  itemCountLabel = computed(() => {
    const count = this.cartService.cartCount();
    return `${count} دوره`;
  });

  get skeletonArray(): number[] {
    return Array(3)
      .fill(0)
      .map((_, i) => i);
  }

  trackByItem(index: number, item: any): string {
    return item.course?._id || index.toString();
  }
}