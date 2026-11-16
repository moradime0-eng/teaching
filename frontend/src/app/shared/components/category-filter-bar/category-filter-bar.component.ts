import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  signal,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Category } from '../../../core/models/category.model';
import { CategoryIconComponent } from '../category-icon/category-icon.component';

/**
 * نوار افقی فیلتر دسته‌بندی - نسخه حرفه‌ای
 * ---------------------------------------------------------------
 * ویژگی‌ها:
 * - دکمه‌های اسکرول چپ/راست با نمایش هوشمند
 * - Scroll shadow در دو طرف
 * - Auto-scroll به آیتم فعال
 * - شمارش دوره‌ها (badge)
 * - انیمیشن‌های نرم و حرفه‌ای
 * - کاملاً responsive و accessible
 */
@Component({
  selector: 'app-category-filter-bar',
  standalone: true,
  imports: [CommonModule, MatIconModule, CategoryIconComponent],
  templateUrl: './category-filter-bar.component.html',
  styleUrl: './category-filter-bar.component.scss',
})
export class CategoryFilterBarComponent implements AfterViewInit, OnDestroy {
  @Input() categories: Category[] = [];
  @Input() activeId: string | null = null;
  @Input() loading = false;
  @Input() allLabel = 'همه دوره‌ها';
  @Input() ariaLabel = 'فیلتر دسته‌بندی دوره‌ها';
  @Input() showCount = true;

  @Output() categoryChange = new EventEmitter<string | null>();

  @ViewChild('trackEl') trackEl?: ElementRef<HTMLDivElement>;

  readonly skeletonItems = Array(7).fill(0);

  // سیگنال‌های وضعیت اسکرول
  readonly canScrollStart = signal(false);
  readonly canScrollEnd = signal(false);

  private resizeObserver?: ResizeObserver;
  private scrollTimeout?: ReturnType<typeof setTimeout>;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngAfterViewInit(): void {
    if (this.isBrowser) {
      this.initScrollObserver();
      // اسکرول اولیه به آیتم فعال
      setTimeout(() => this.scrollToActive(), 100);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
  }

  isActive(id: string | null): boolean {
    return this.activeId === id;
  }

  select(id: string | null): void {
    if (this.activeId === id) return;
    this.categoryChange.emit(id);
    // اسکرول نرم به آیتم انتخاب شده
    setTimeout(() => this.scrollToActive(), 50);
  }

  trackById(_: number, cat: Category): string {
    return cat._id;
  }

  /** اسکرول با دکمه‌های جهت */
  scrollBy(direction: 'start' | 'end'): void {
    const el = this.trackEl?.nativeElement;
    if (!el) return;
    const amount = el.clientWidth * 0.7;
    // در RTL جهت‌ها معکوس هستند
    const delta = direction === 'start' ? amount : -amount;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }

  /** رویداد اسکرول */
  onScroll(): void {
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => this.updateScrollState(), 50);
  }

  private initScrollObserver(): void {
    if (!this.isBrowser) return;
    const el = this.trackEl?.nativeElement;
    if (!el) return;

    this.updateScrollState();

    this.resizeObserver = new ResizeObserver(() => this.updateScrollState());
    this.resizeObserver.observe(el);
  }

  private updateScrollState(): void {
    const el = this.trackEl?.nativeElement;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    // در RTL، scrollLeft مقدار منفی یا صفر دارد
    const maxScroll = scrollWidth - clientWidth;
    const absScroll = Math.abs(scrollLeft);

    // در RTL: "start" یعنی سمت راست، "end" یعنی سمت چپ
    this.canScrollStart.set(absScroll < maxScroll - 2);
    this.canScrollEnd.set(absScroll > 2);
  }

  private scrollToActive(): void {
    const el = this.trackEl?.nativeElement;
    if (!el) return;

    const activeChip = el.querySelector<HTMLElement>('.cfb__chip.is-active');
    if (!activeChip) return;

    const containerRect = el.getBoundingClientRect();
    const chipRect = activeChip.getBoundingClientRect();

    // اگر آیتم بیرون از دید باشد، اسکرول کن
    if (chipRect.left < containerRect.left || chipRect.right > containerRect.right) {
      activeChip.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }
}