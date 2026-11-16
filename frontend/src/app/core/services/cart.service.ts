import { Injectable, signal, computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Cart } from '../models/cart.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(ApiService);
  private authService = inject(AuthService);
  private cartSignal = signal<Cart | null>(null);

  cart = this.cartSignal.asReadonly();
  cartCount = computed(() => this.cartSignal()?.items.length || 0);
  totalPrice = computed(() => this.cartSignal()?.totalPrice || 0);
  finalPrice = computed(() => this.cartSignal()?.finalPrice || 0);

  constructor() {
    // Cart loading is handled by components (cart, checkout)
    // to avoid duplicate API calls on page navigation.
  }

  loadCart(): Observable<ApiResponse<Cart>> {
    return this.api.get<Cart>('/cart').pipe(
      tap((res) => {
        if (res.success && res.data) this.cartSignal.set(res.data);
      }),
    );
  }

  addToCart(courseId: string): Observable<ApiResponse<Cart>> {
    return this.api.post<Cart>('/cart', { courseId }).pipe(
      tap((res) => {
        if (res.success && res.data) this.cartSignal.set(res.data);
      }),
    );
  }

  removeFromCart(courseId: string): Observable<ApiResponse<Cart>> {
    return this.api.delete<Cart>(`/cart/${courseId}`).pipe(
      tap((res) => {
        if (res.success && res.data) this.cartSignal.set(res.data);
      }),
    );
  }


  applyCoupon(code: string): Observable<ApiResponse<any>> {
    return this.api.post<any>('/coupons/validate', { code });
  }
}
