import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/services/api.service';
import { Ticket } from '../../core/models/ticket.model';
import { JalaliDatePipe } from '../../shared/pipes/jalali-date.pipe';
import { TicketDetailComponent } from './ticket-detail.component';
import { ActivatedRoute } from '@angular/router';
import { RichTextEditorComponent } from '../../shared/components/rich-text-editor/rich-text-editor.component';

interface Category {
  value: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

interface Priority {
  value: string;
  label: string;
  color: string;
  icon: string;
}

interface FaqItem {
  question: string;
  answer: string;
  isOpen: boolean;
}

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, JalaliDatePipe, TicketDetailComponent, RichTextEditorComponent],
  templateUrl: './support.component.html',
  styleUrl: './support.component.scss',
})
export class SupportComponent implements OnInit {
  tickets = signal<Ticket[]>([]);
  isLoading = signal<boolean>(true);
  showNewTicketForm = signal<boolean>(false);
  isSubmitting = signal<boolean>(false);
  activeFilter = signal<string>('all');
  searchQuery = signal<string>('');
  currentStep = signal<number>(1);
  selectedTicket = signal<Ticket | null>(null);

  newTicket = {
    subject: '',
    category: 'technical',
    priority: 'medium',
    message: '',
  };

  categories: Category[] = [
    {
      value: 'technical',
      label: 'مشکل فنی',
      icon: 'bug_report',
      color: 'blue',
      description: 'خطاها، مشکلات پخش و باگ‌ها',
    },
    {
      value: 'billing',
      label: 'مالی و پرداخت',
      icon: 'payments',
      color: 'green',
      description: 'فاکتور، پرداخت و بازگشت وجه',
    },
    {
      value: 'course',
      label: 'دوره‌های آموزشی',
      icon: 'school',
      color: 'purple',
      description: 'سوالات درباره محتوای دوره‌ها',
    },
    {
      value: 'account',
      label: 'حساب کاربری',
      icon: 'manage_accounts',
      color: 'amber',
      description: 'ورود، رمز عبور و پروفایل',
    },
    {
      value: 'other',
      label: 'موارد دیگر',
      icon: 'help_outline',
      color: 'slate',
      description: 'سایر سوالات و پیشنهادات',
    },
  ];

  priorities: Priority[] = [
    { value: 'low', label: 'کم', color: 'slate', icon: 'low_priority' },
    { value: 'medium', label: 'متوسط', color: 'blue', icon: 'drag_handle' },
    { value: 'high', label: 'زیاد', color: 'amber', icon: 'priority_high' },
    { value: 'urgent', label: 'فوری', color: 'red', icon: 'error' },
  ];

  faqs: FaqItem[] = [
    {
      question: 'چگونه می‌توانم رمز عبور خود را بازیابی کنم؟',
      answer:
        'در صفحه ورود روی گزینه "فراموشی رمز عبور" کلیک کنید و ایمیل خود را وارد نمایید. لینک بازیابی برای شما ارسال خواهد شد.',
      isOpen: false,
    },
    {
      question: 'مدت زمان پاسخگویی به تیکت‌ها چقدر است؟',
      answer: 'تیکت‌های عادی حداکثر ظرف ۲۴ ساعت کاری و تیکت‌های فوری ظرف ۲ ساعت پاسخ داده می‌شوند.',
      isOpen: false,
    },
    {
      question: 'آیا امکان بازگشت وجه پس از خرید دوره وجود دارد؟',
      answer:
        'بله، تا ۷ روز پس از خرید و در صورت مشاهده کمتر از ۲۰٪ از دوره، امکان درخواست بازگشت وجه وجود دارد.',
      isOpen: false,
    },
    {
      question: 'چگونه می‌توانم گواهی پایان دوره را دریافت کنم؟',
      answer:
        'پس از تکمیل ۱۰۰٪ دوره و قبولی در آزمون پایانی، گواهی به صورت خودکار در پروفایل شما فعال می‌شود.',
      isOpen: false,
    },
  ];

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    this.loadTickets();

    // اگر ticket ID از query params اومد، اون تیکت رو باز کن
    const ticketId = this.route.snapshot.queryParamMap.get('ticket');
    if (ticketId && isPlatformBrowser(this.platformId)) {
      // بعد از لود شدن تیکت‌ها، تیکت مورد نظر رو پیدا و باز کن
      setTimeout(() => {
        const ticket = this.tickets().find((t: any) => t._id === ticketId);
        if (ticket) {
          this.openTicketDetail(ticket);
        }
      }, 500);
    }
  }

  loadTickets(): void {
    this.isLoading.set(true);
    this.api.getPaginated<Ticket>('/tickets/my').subscribe({
      next: (res) => {
        if (res.data) this.tickets.set(res.data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  submitTicket(): void {
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);
    this.api.post<any>('/tickets', this.newTicket).subscribe({
      next: () => {
        this.closeForm();
        this.loadTickets();
        this.isSubmitting.set(false);
      },
      error: () => this.isSubmitting.set(false),
    });
  }

  openNewTicketForm(): void {
    this.showNewTicketForm.set(true);
    this.currentStep.set(1);
  }

  closeForm(): void {
    this.showNewTicketForm.set(false);
    this.currentStep.set(1);
    this.newTicket = {
      subject: '',
      category: 'technical',
      priority: 'medium',
      message: '',
    };
  }

  nextStep(): void {
    if (this.currentStep() < 3 && this.canProceedStep()) {
      this.currentStep.update((s) => s + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update((s) => s - 1);
    }
  }

  selectCategory(cat: string): void {
    this.newTicket.category = cat;
  }

  selectPriority(pri: string): void {
    this.newTicket.priority = pri;
  }

  toggleFaq(index: number): void {
    this.faqs[index].isOpen = !this.faqs[index].isOpen;
  }

  setFilter(filter: string): void {
    this.activeFilter.set(filter);
  }

  openTicketDetail(ticket: Ticket): void {
    this.selectedTicket.set(ticket);
  }

  closeTicketDetail(): void {
    this.selectedTicket.set(null);
  }

  onTicketReplied(): void {
    this.loadTickets();
  }

  canProceedStep(): boolean {
    if (this.currentStep() === 1) {
      return !!this.newTicket.category;
    }
    if (this.currentStep() === 2) {
      return this.newTicket.subject.trim().length >= 5;
    }
    return true;
  }

  canSubmit(): boolean {
    return (
      this.newTicket.subject.trim().length >= 5 &&
      this.newTicket.message.trim().length >= 10 &&
      !!this.newTicket.category
    );
  }

  getCategoryInfo(value: string): Category | undefined {
    return this.categories.find((c) => c.value === value);
  }

  getPriorityInfo(value: string): Priority | undefined {
    return this.priorities.find((p) => p.value === value);
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      open: 'باز',
      in_progress: 'در حال بررسی',
      resolved: 'حل شده',
      closed: 'بسته شده',
      pending: 'در انتظار',
    };
    return labels[status] || status;
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      open: 'mark_email_unread',
      in_progress: 'sync',
      resolved: 'check_circle',
      closed: 'lock',
      pending: 'schedule',
    };
    return icons[status] || 'help';
  }

  filteredTickets = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.activeFilter();
    let list = this.tickets();

    if (filter !== 'all') {
      list = list.filter((t) => t.status === filter);
    }

    if (query) {
      list = list.filter(
        (t) =>
          t.subject?.toLowerCase().includes(query) ||
          (t as any).ticketNumber?.toLowerCase().includes(query),
      );
    }

    return list;
  });

  ticketStats = computed(() => {
    const all = this.tickets();
    return {
      total: all.length,
      open: all.filter((t) => t.status === 'open').length,
      inProgress: all.filter((t) => t.status === 'in_progress').length,
      resolved: all.filter((t) => t.status === 'resolved').length,
    };
  });

  get skeletonArray(): number[] {
    return Array(3)
      .fill(0)
      .map((_, i) => i);
  }

  trackByTicketId(index: number, ticket: any): string {
    return ticket._id || ticket.ticketNumber || index.toString();
  }
}
