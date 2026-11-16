import { Course } from './course.model';

export interface CartItem {
  course: Course | string;
  priceAtAdd: number;
  addedAt: string;
}

export interface Cart {
  _id: string;
  user: string;
  items: CartItem[];
  coupon?: string;
  totalPrice: number;
  discountAmount: number;
  finalPrice: number;
}