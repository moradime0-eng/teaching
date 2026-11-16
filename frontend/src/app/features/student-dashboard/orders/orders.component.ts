import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment.development';

interface PaymentItem {
  course?: { title: string; slug: string; thumbnail?: string };
  price: number;
}

interface Order {
  _id: string;
  orderNumber?: string;
  items?: PaymentItem[];
  finalAmount: number;
  totalAmount?: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="orders-container">
      <h1 class="orders-title">سفارش‌های من</h1>

      @if (loading) {
        <div class="loading-state">
          <p>در حال بارگذاری...</p>
        </div>
      }

      @if (!loading && orders.length === 0) {
        <div class="empty-state">
          <p>هنوز سفارشی ثبت نشده است.</p>
        </div>
      }

      @if (!loading && orders.length > 0) {
        <div class="orders-table-wrapper">
          <table class="orders-table">
            <thead>
              <tr>
                <th>دوره</th>
                <th>مبلغ (تومان)</th>
                <th>روش پرداخت</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
              </tr>
            </thead>
            <tbody>
              @for (order of orders; track order._id) {
                <tr>
                  <td>{{ courseTitles(order) }}</td>
                  <td>{{ order.finalAmount | number }}</td>
                  <td>{{ paymentMethodLabel(order.paymentMethod) }}</td>
                  <td>
                    <span class="status-badge" [class]="'status-' + order.status">
                      {{ getStatusLabel(order.status) }}
                    </span>
                  </td>
                  <td>{{ order.createdAt | date:'yyyy/MM/dd' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (error) {
        <div class="error-state">
          <p>خطا در دریافت سفارش‌ها. لطفاً دوباره تلاش کنید.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .orders-container {
      max-width: 900px;
      margin: 2rem auto;
      padding: 1.5rem;
      direction: rtl;
      font-family: inherit;
    }
    .orders-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 1.5rem;
    }
    .orders-table-wrapper {
      overflow-x: auto;
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .orders-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card-solid);
    }
    .orders-table th {
      background: var(--bg-secondary);
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.875rem;
      padding: 0.875rem 1rem;
      text-align: right;
      border-bottom: 1px solid var(--border);
    }
    .orders-table td {
      padding: 0.875rem 1rem;
      color: var(--text);
      font-size: 0.9rem;
      border-bottom: 1px solid var(--border);
    }
    .orders-table tbody tr:last-child td { border-bottom: none; }
    .orders-table tbody tr:hover { background: var(--bg-secondary); }
    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .status-success { background: rgba(16,185,129,0.1); color: var(--success); }
    .status-completed { background: rgba(16,185,129,0.1); color: var(--success); }
    .status-pending { background: rgba(245,158,11,0.1); color: var(--warning); }
    .status-failed { background: rgba(239,68,68,0.1); color: var(--danger); }
    .status-refunded { background: rgba(59,130,246,0.1); color: var(--info); }
    .status-reversed { background: rgba(59,130,246,0.1); color: var(--info); }
    .status-expired { background: rgba(100,116,139,0.1); color: var(--text-muted); }
    .empty-state, .loading-state, .error-state {
      text-align: center;
      padding: 3rem;
      color: var(--text-muted);
      background: var(--card-solid);
      border-radius: 12px;
      border: 1px solid var(--border);
    }
    .error-state { color: var(--danger); }
  `]
})
export class OrdersComponent implements OnInit {
  private http = inject(HttpClient);
  orders: Order[] = [];
  loading = true;
  error = false;

  ngOnInit() {
    this.http.get<any>(`${environment.apiUrl}/payments/history`).subscribe({
      next: (res) => {
        this.orders = res.data || res.payments || [];
        this.loading = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
      }
    });
  }

  courseTitles(order: Order): string {
    const titles = (order.items || [])
      .map((item) => item?.course?.title)
      .filter((title): title is string => !!title);
    return titles.length ? titles.join('، ') : 'نامشخص';
  }

  paymentMethodLabel(method: string): string {
    const map: Record<string, string> = {
      nikpal: 'پرداخت آنلاین',
      zarinpal: 'درگاه پرداخت (قدیمی)',
      wallet: 'کیف پول',
      free: 'رایگان',
    };
    return map[method] || method || 'نامشخص';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      success: 'موفق',
      completed: 'موفق',
      pending: 'در انتظار',
      failed: 'ناموفق',
      refunded: 'بازپرداخت شده',
      reversed: 'برگشت خورده',
      expired: 'منقضی شده',
    };
    return map[status] || status;
  }
}
