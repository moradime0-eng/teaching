import { Component, OnInit, signal, computed, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../core/services/api.service';
import { Ticket, TicketMessage, TicketUser } from '../../../core/models/ticket.model';
import { JalaliDatePipe } from '../../../shared/pipes/jalali-date.pipe';
import { SanitizeHtmlPipe } from '../../../shared/pipes/sanitize-html.pipe';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-admin-tickets',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    JalaliDatePipe,
    SanitizeHtmlPipe,
    RichTextEditorComponent,
  ],
  templateUrl: './admin-tickets.component.html',
  styleUrl: './admin-tickets.component.scss',
})
export class AdminTicketsComponent implements OnInit {
  // ═══════════════════════════════════════════════
  // Dependency Injection
  // ═══════════════════════════════════════════════
  private readonly api = inject(ApiService);
  private readonly activatedRoute = inject(ActivatedRoute);

  // ═══════════════════════════════════════════════
  // State Signals
  // ═══════════════════════════════════════════════
  readonly tickets = signal<Ticket[]>([]);
  readonly detailMessages = signal<TicketMessage[]>([]);
  readonly selectedTicket = signal<Ticket | null>(null);
  readonly isLoading = signal<boolean>(true);
  readonly isSending = signal<boolean>(false);
  readonly activeFilter = signal<string>('all');
  readonly roleFilter = signal<string>('all');

  // Mobile-specific signals
  readonly showMobileFilters = signal<boolean>(false);
  readonly isMobileView = signal<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );

  // ═══════════════════════════════════════════════
  // Two-way binding models
  // ═══════════════════════════════════════════════
  searchQuery = '';
  replyText = '';
  newStatus = '';

  // ═══════════════════════════════════════════════
  // Private fields
  // ═══════════════════════════════════════════════
  private currentUserId = '';

  // ═══════════════════════════════════════════════
  // Computed Signals
  // ═══════════════════════════════════════════════
  readonly stats = computed(() => {
    const all = this.tickets();
    return {
      total: all.length,
      open: all.filter((t) => t.status === 'open').length,
      inProgress: all.filter((t) => t.status === 'in_progress').length,
      resolved: all.filter((t) => t.status === 'resolved').length,
    };
  });

  readonly filteredTickets = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    let list = this.tickets();

    if (this.activeFilter() !== 'all') {
      list = list.filter((t) => t.status === this.activeFilter());
    }

    if (query) {
      list = list.filter(
        (t) =>
          t.subject?.toLowerCase().includes(query) ||
          t.ticketNumber?.toLowerCase().includes(query) ||
          this.extractUserName(t.user).toLowerCase().includes(query),
      );
    }

    return list;
  });

  // ═══════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════
  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadTickets();
    this.checkQueryParams();
  }

  // ═══════════════════════════════════════════════
  // Host Listeners (Responsive)
  // ═══════════════════════════════════════════════
  @HostListener('window:resize')
  onWindowResize(): void {
    this.isMobileView.set(window.innerWidth <= 900);
  }

  // ═══════════════════════════════════════════════
  // Initialization Helpers
  // ═══════════════════════════════════════════════
  private loadCurrentUser(): void {
    try {
      const user = JSON.parse(localStorage.getItem('current_user') || '{}');
      this.currentUserId = user._id || user.id || '';
    } catch {
      this.currentUserId = '';
    }
  }

  private checkQueryParams(): void {
    const ticketId = this.activatedRoute.snapshot.queryParamMap.get('ticket');
    if (ticketId) {
      setTimeout(() => this.loadTicketDetail(ticketId), 500);
    }
  }

  // ═══════════════════════════════════════════════
  // API Calls
  // ═══════════════════════════════════════════════
  loadTickets(): void {
    this.isLoading.set(true);
    const params: Record<string, string> = {};

    if (this.roleFilter() !== 'all') {
      params['role'] = this.roleFilter();
    }
    if (this.activeFilter() !== 'all') {
      params['status'] = this.activeFilter();
    }

    this.api.get<any>('/tickets', params).subscribe({
      next: (res: any) => {
        const data = res?.data || res?.results || res || [];
        const ticketList = Array.isArray(data) ? data : [];
        this.tickets.set(ticketList);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  loadTicketDetail(ticketId: string): void {
    this.api.get<any>(`/tickets/${ticketId}`).subscribe({
      next: (res: any) => {
        const data = res?.data || res;
        if (data) {
          this.detailMessages.set(data.messages || []);
          this.selectedTicket.set(data);
          this.newStatus = data.status;
        }
      },
    });
  }

  sendReply(): void {
    if (!this.canReply() || !this.selectedTicket()) return;
    this.isSending.set(true);

    this.api
      .post<any>(`/tickets/${this.selectedTicket()!._id}/reply`, {
        content: this.replyText.trim(),
      })
      .subscribe({
        next: () => {
          this.replyText = '';
          this.loadTicketDetail(this.selectedTicket()!._id);
          this.loadTickets();
          this.isSending.set(false);
        },
        error: () => this.isSending.set(false),
      });
  }

  changeStatus(): void {
    if (!this.selectedTicket()) return;
    this.api
      .put<any>(`/tickets/${this.selectedTicket()!._id}/status`, {
        status: this.newStatus,
      })
      .subscribe({
        next: () => {
          this.loadTicketDetail(this.selectedTicket()!._id);
          this.loadTickets();
        },
      });
  }

  // ═══════════════════════════════════════════════
  // UI Actions
  // ═══════════════════════════════════════════════
  setFilter(filter: string): void {
    this.activeFilter.set(filter);
    this.loadTickets();
  }

  setRoleFilter(role: string): void {
    this.roleFilter.set(role);
    this.loadTickets();
  }

  selectTicket(ticket: Ticket): void {
    this.selectedTicket.set(ticket);
    this.newStatus = ticket.status as string;
    this.replyText = '';
    this.loadTicketDetail(ticket._id);
  }

  toggleMobileFilters(): void {
    this.showMobileFilters.update((v) => !v);
  }

  closeMobileDetail(): void {
    this.selectedTicket.set(null);
    this.detailMessages.set([]);
    this.replyText = '';
  }

  canReply(): boolean {
    const plain = this.stripHtml(this.replyText);
    return plain.trim().length >= 2 && this.replyText.length <= 5000;
  }

  // ═══════════════════════════════════════════════
  // HTML Utilities
  // ═══════════════════════════════════════════════

  /** حذف تگ‌های HTML و برگرداندن متن خالص */
  stripHtml(html: string | undefined | null): string {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const text = temp.textContent || temp.innerText || '';
    return text.trim().replace(/\s+/g, ' ');
  }

  /** کوتاه کردن متن با ... */
  truncateText(text: string, maxLength = 80): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /** پیش‌نمایش آخرین پیام تیکت (بدون HTML) */
  getLastMessagePreview(ticket: Ticket): string {
    if (!ticket.messages?.length) return '';
    const lastMsg = ticket.messages[ticket.messages.length - 1];
    const plain = this.stripHtml(lastMsg.content);
    return this.truncateText(plain, 80) || 'پیام خالی';
  }

  // ═══════════════════════════════════════════════
  // User Helpers
  // ═══════════════════════════════════════════════
  extractUserName(user: string | TicketUser | any): string {
    if (!user) return 'کاربر';
    if (typeof user === 'string') return user;
    return user.fullName || user.name || user.username || 'کاربر';
  }

  extractUserEmail(user: string | TicketUser | any): string {
    if (!user || typeof user === 'string') return '';
    return user.email || '';
  }

  extractUserRole(user: string | TicketUser | any): string {
    if (!user || typeof user === 'string') return 'student';
    return user.role || 'student';
  }

  extractSenderName(sender: string | TicketUser | any): string {
    if (!sender) return 'ناشناس';
    if (typeof sender === 'string') return 'کاربر';
    return sender.fullName || sender.name || sender.username || 'کاربر';
  }

  isSenderAdmin(msg: TicketMessage): boolean {
    const sender = msg.sender as any;
    if (!sender) return false;

    if (typeof sender === 'object' && sender !== null) {
      if (sender.role === 'admin') return true;
      const senderId = sender._id || sender.id;
      if (senderId && this.currentUserId) {
        return String(senderId) === String(this.currentUserId);
      }
      return false;
    }

    if (typeof sender === 'string' && this.currentUserId) {
      return sender === this.currentUserId;
    }

    return false;
  }

  // ═══════════════════════════════════════════════
  // Label Helpers
  // ═══════════════════════════════════════════════
  getRoleLabel(role: string): string {
    const map: Record<string, string> = {
      admin: 'ادمین',
      instructor: 'مدرس',
      student: 'دانشجو',
    };
    return map[role] || 'دانشجو';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      open: 'باز',
      in_progress: 'در حال بررسی',
      resolved: 'حل شده',
      closed: 'بسته شده',
    };
    return map[status] || status;
  }

  getPriorityLabel(priority: string): string {
    const map: Record<string, string> = {
      low: 'کم',
      medium: 'متوسط',
      high: 'زیاد',
      urgent: 'فوری',
    };
    return map[priority] || priority;
  }

  // ═══════════════════════════════════════════════
  // Track By
  // ═══════════════════════════════════════════════
  trackById(index: number, item: Ticket): string {
    return item._id;
  }
}