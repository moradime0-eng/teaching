export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  REVERSED = 'reversed',
  EXPIRED = 'expired',
}

export interface Payment {
  _id: string;
  user: string;
  orderNumber: string;
  items: PaymentItem[];
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  paymentMethod: 'nikpal' | 'zarinpal' | 'wallet' | 'free';
  status: PaymentStatus;
  paidAt?: string;
  createdAt: string;
}

export interface PaymentItem {
  course: string;
  price: number;
  instructorShare: number;
  platformShare: number;
}