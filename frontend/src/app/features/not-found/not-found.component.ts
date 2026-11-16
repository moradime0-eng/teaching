import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="not-found-container">
      <div class="not-found-content">
        <div class="error-code">۴۰۴</div>
        <h1>صفحه مورد نظر یافت نشد</h1>
        <p>متأسفانه صفحه‌ای که به دنبال آن هستید وجود ندارد یا منتقل شده است.</p>
        <a routerLink="/" class="back-home-btn">بازگشت به صفحه اصلی</a>
      </div>
    </div>
  `,
  styles: [`
    .not-found-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      padding: 2rem;
      background: var(--bg-primary);
      color: var(--text);
      font-family: inherit;
      direction: rtl;
    }
    .not-found-content {
      text-align: center;
      max-width: 500px;
    }
    .error-code {
      font-size: 8rem;
      font-weight: 900;
      color: var(--accent);
      line-height: 1;
      margin-bottom: 1rem;
      opacity: 0.8;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--text);
    }
    p {
      font-size: 1.1rem;
      color: var(--text-muted);
      margin-bottom: 2rem;
      line-height: 1.8;
    }
    .back-home-btn {
      display: inline-block;
      padding: 0.875rem 2.5rem;
      background: var(--accent);
      color: #fff;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 1rem;
      transition: opacity 0.2s, transform 0.2s;
    }
    .back-home-btn:hover {
      opacity: 0.9;
      transform: translateY(-2px);
    }
  `]
})
export class NotFoundComponent {}
