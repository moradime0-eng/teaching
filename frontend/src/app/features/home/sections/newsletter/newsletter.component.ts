import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../../core/services/api.service';

@Component({
  selector: 'app-newsletter',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './newsletter.component.html',
  styleUrl: './newsletter.component.scss',
})
export class NewsletterComponent {
  private api = inject(ApiService);

  email = '';
  isLoading = signal(false);
  status = signal<'idle' | 'success' | 'error'>('idle');
  message = signal('');

  async subscribe(): Promise<void> {
    if (!this.email || this.isLoading()) return;

    this.isLoading.set(true);
    this.status.set('idle');

    this.api.post('/newsletter/subscribe', { email: this.email }).subscribe({
      next: () => {
        this.status.set('success');
        this.message.set('با موفقیت عضو شدید!');
        this.email = '';
        this.isLoading.set(false);
      },
      error: (err) => {
        this.status.set('error');
        this.message.set(err?.error?.message || 'خطا در عضویت. دوباره تلاش کنید.');
        this.isLoading.set(false);
      },
    });
  }
}
