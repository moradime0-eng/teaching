import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { Ticket, TicketMessage } from '../../core/models/ticket.model';
import { JalaliDatePipe } from '../../shared/pipes/jalali-date.pipe';
import { SanitizeHtmlPipe } from '../../shared/pipes/sanitize-html.pipe';
import { RichTextEditorComponent } from '../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, JalaliDatePipe, SanitizeHtmlPipe, RichTextEditorComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.scss',
})
export class TicketDetailComponent implements OnChanges {
  @Input() ticket: Ticket | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() replied = new EventEmitter<void>();

  private api = inject(ApiService);

  messages = signal<TicketMessage[]>([]);
  isLoadingMessages = signal(true);
  isSendingReply = signal(false);
  replyText = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ticket'] && this.ticket) {
      this.loadMessages();
    }
  }

  loadMessages(): void {
    if (!this.ticket) return;
    this.isLoadingMessages.set(true);
    this.api.get<Ticket>(`/tickets/${this.ticket._id}`).subscribe({
      next: (res: any) => {
        if (res.data) {
          this.messages.set(res.data.messages || []);
        }
        this.isLoadingMessages.set(false);
      },
      error: () => this.isLoadingMessages.set(false),
    });
  }

  canReply(): boolean {
    return this.replyText.trim().length >= 5 && this.replyText.length <= 5000;
  }

  sendReply(): void {
    if (!this.canReply() || !this.ticket) return;

    this.isSendingReply.set(true);
    this.api
      .post<any>(`/tickets/${this.ticket._id}/reply`, {
        content: this.replyText.trim(),
      })
      .subscribe({
        next: () => {
          this.replyText = '';
          this.loadMessages();
          this.isSendingReply.set(false);
          this.replied.emit();
        },
        error: () => this.isSendingReply.set(false),
      });
  }

  isFromAdmin(msg: TicketMessage): boolean {
    let currentUser: any = null;
    try {
      const raw = localStorage.getItem('current_user');
      if (raw) currentUser = JSON.parse(raw);
    } catch {
      currentUser = null;
    }
    const senderId = typeof msg.sender === 'object' ? (msg.sender as any)._id : msg.sender;
    return senderId !== currentUser?._id;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      open: 'باز',
      in_progress: 'در حال بررسی',
      resolved: 'حل شده',
      closed: 'بسته شده',
    };
    return labels[status] || status;
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      open: 'mark_email_unread',
      in_progress: 'sync',
      resolved: 'check_circle',
      closed: 'lock',
    };
    return icons[status] || 'help';
  }

  getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      low: 'کم',
      medium: 'متوسط',
      high: 'زیاد',
      urgent: 'فوری',
    };
    return labels[priority] || priority;
  }
}