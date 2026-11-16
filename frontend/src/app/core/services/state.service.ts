import { Injectable, signal, computed } from '@angular/core';
import { User } from '../models/user.model';
import { Cart } from '../models/cart.model';

@Injectable({ providedIn: 'root' })
export class StateService {
  // ۱. حالت‌های اصلی (Signals)
  private userState = signal<User | null>(null);
  private cartState = signal<Cart | null>(null);
  private currentCourseIdState = signal<string | null>(null);

  // ۲. متغیرهای آماده مصرف خواندنی (ReadOnly Signals)
  currentUser = this.userState.asReadonly();
  currentCart = this.cartState.asReadonly();
  currentCourseId = this.currentCourseIdState.asReadonly();

  // ۳. حالت‌های محاسباتی سریع (Computed Signals)
  cartItemsCount = computed(() => this.cartState()?.items.length || 0);
  isLoggedIn = computed(() => this.userState() !== null);
  userRole = computed(() => this.userState()?.role || null);

  // ۴. متدهای ویرایش حالت‌ها
  setUser(user: User | null): void {
    this.userState.set(user);
  }

  setCart(cart: Cart | null): void {
    this.cartState.set(cart);
  }

  setCourseId(courseId: string | null): void {
    this.currentCourseIdState.set(courseId);
  }

  clearAllStates(): void {
    this.userState.set(null);
    this.cartState.set(null);
    this.currentCourseIdState.set(null);
  }
}
