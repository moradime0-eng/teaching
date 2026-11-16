import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../../../core/services/api.service';

interface FAQ {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss',
})
export class FaqComponent implements OnInit {
  private api = inject(ApiService);
  
  openIndex = signal<number | null>(null);
  faqs = signal<FAQ[]>([]);
  isLoading = signal(true);

  ngOnInit(): void {
    this.loadFAQs();
  }

  private loadFAQs(): void {
    this.isLoading.set(true);
    this.api.get<{ faqs: FAQ[] }>('/home/faqs').subscribe({
      next: (res) => {
        if (res.success && res.data?.faqs) {
          this.faqs.set(res.data.faqs);
        } else {
          // Fallback to default FAQs
          this.faqs.set(this.getDefaultFAQs());
        }
        this.isLoading.set(false);
      },
      error: () => {
        // Fallback to default FAQs if API fails
        this.faqs.set(this.getDefaultFAQs());
        this.isLoading.set(false);
      },
    });
  }

  private getDefaultFAQs(): FAQ[] {
    return [
      {
        question: 'آیا دوره‌ها پروژه‌محور هستند؟',
        answer: 'بله، تمام دوره‌های همایون به صورت پروژه‌محور طراحی شده‌اند. شما در طول دوره پروژه‌های واقعی می‌سازید که می‌توانید در رزومه خود قرار دهید.',
      },
      {
        question: 'دسترسی به دوره‌ها چگونه است؟',
        answer: 'پس از خرید دوره، دسترسی مادام‌العمر به تمام محتوای دوره شامل ویدیوها، پروژه‌ها و آپدیت‌های آینده خواهید داشت.',
      },
      {
        question: 'آیا گواهینامه پایان دوره معتبر است؟',
        answer: 'بله، گواهینامه همایون دو زبانه، قابل ترجمه رسمی و استعلام آنلاین از طریق QR Code است. این گواهینامه توسط بسیاری از شرکت‌های فناوری پذیرفته شده است.',
      },
      {
        question: 'آیا امکان بازگشت وجه وجود دارد؟',
        answer: 'بله، تا ۷ روز پس از خرید هر دوره، در صورت عدم رضایت می‌توانید درخواست بازگشت وجه ارسال کنید.',
      },
      {
        question: 'چگونه می‌توانم به عنوان مدرس در همایون فعالیت کنم؟',
        answer: 'از بخش «شروع تدریس» درخواست خود را ثبت کنید. پس از بررسی رزومه و نمونه تدریس، امکان انتشار دوره‌های شما فراهم خواهد شد.',
      },
      {
        question: 'آیا دوره‌های رایگان هم دارید؟',
        answer: 'بله، تعدادی از دوره‌ها به صورت رایگان ارائه شده‌اند. این دوره‌ها کیفیت بالایی دارند و برای شروع یادگیری بسیار مناسب هستند.',
      },
    ];
  }

  toggle(index: number): void {
    this.openIndex.set(this.openIndex() === index ? null : index);
  }
}
