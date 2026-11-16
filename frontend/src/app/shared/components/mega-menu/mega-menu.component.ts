import {
  Component,
  signal,
  computed,
  OnInit,
  OnDestroy,
  inject,
  HostListener,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { trigger, transition, style, animate, state } from '@angular/animations';

import { MegaMenuService } from '../../../core/services/mega-menu.service';
import { PageBackdropService } from '../../../core/services/page-backdrop.service';
import {
  MegaCategory,  MegaSubCategory,
  MegaTopic,
  RecentCategory,
} from '../../../core/models/mega-menu.model';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';
import { CategoryIconComponent } from '../category-icon/category-icon.component';

/* ═══════════════ View Models ═══════════════ */
export interface SearchHit {
  kind: 'category' | 'sub' | 'topic';
  id: string;
  name: string;
  count: number;
  cat: MegaCategory;
  sub?: MegaSubCategory;
  topic?: MegaTopic;
}

export interface HotTopic {
  topic: MegaTopic;
  sub: MegaSubCategory;
}

@Component({
  selector: 'app-mega-menu',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, FormsModule, ClickOutsideDirective, CategoryIconComponent],
  templateUrl: './mega-menu.component.html',
  styleUrl: './mega-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('panelEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px) scale(0.98)' }),
        animate(
          '340ms cubic-bezier(0.16, 1, 0.3, 1)',
          style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
        ),
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'translateY(10px) scale(0.985)' })),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [animate('140ms ease-in', style({ opacity: 0 }))]),
    ]),
    trigger('rotate', [
      state('open', style({ transform: 'rotate(180deg)' })),
      state('closed', style({ transform: 'rotate(0deg)' })),
      transition('open <=> closed', animate('220ms cubic-bezier(0.4, 0, 0.2, 1)')),
    ]),
    trigger('accordion', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('260ms cubic-bezier(0.4, 0, 0.2, 1)', style({ height: '*', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ height: 0, opacity: 0 })),
      ]),
    ]),
  ],
})
export class MegaMenuComponent implements OnInit, OnDestroy {
  private megaMenuService = inject(MegaMenuService);
  private pageBackdrop = inject(PageBackdropService);
  private router = inject(Router);

  @ViewChild('searchBox') searchBox?: ElementRef<HTMLInputElement>;
  @ViewChild('mmPanel') mmPanel?: ElementRef<HTMLElement>;

  /** والد (navbar) با این event می‌فهمد که ناوبری انجام شد (بستن drawer در موبایل) */
  readonly navigated = output<void>();

  // ═══════════════════ Signals ═══════════════════
  isOpen = signal(false);
  /** کلیک = پین‌شده / هاور = موقت */
  pinned = signal(false);
  selectedCategory = signal<MegaCategory | null>(null);
  searchQuery = signal('');
  expandedId = signal<string | null>(null);
  isMobile = signal(false);

  // ═══════════════════ Timers ═══════════════════
  private closeTimer: any = null;
  private readonly CLOSE_DELAY = 240;

  /**
   * ⚠️ این مقدار باید دقیقاً با بیک‌پوینت موبایل نوار بالا ($bp-md) یکی باشد،
   * وگرنه بین دو بازه، چیدمان دسکتاپ داخل drawer موبایل نمایش داده می‌شود.
   */
  private static readonly MOBILE_BP = 900;
  private mql?: MediaQueryList;
  private readonly onMqChange = (e: MediaQueryListEvent | MediaQueryList): void => {
    const isMobile = e.matches;
    this.isMobile.set(isMobile);
    // اگر در حالت موبایل باز بود، حالت pin را بازنشانی کن
    if (isMobile) this.pinned.set(true);
  };

  // ═══════════════════ RxJS ═══════════════════
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  // ═══════════════════ Service State ═══════════════════
  readonly categories = this.megaMenuService.filteredCategories;
  readonly isLoading = this.megaMenuService.isLoading;
  readonly totalCourses = this.megaMenuService.totalCoursesCount;

  readonly recentCategories = computed<RecentCategory[]>(() => {
    if (!this.isOpen()) return [];
    return this.megaMenuService.getRecentCategories();
  });

  // ═══════════════════ Search ═══════════════════
  readonly searchHits = computed<SearchHit[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const cat of this.categories()) {
      // نام دسته یا زیردسته‌هایش با عبارت جست‌وجو تطابق دارد
      const catNameHit = cat.name.toLowerCase().includes(q);
      if (catNameHit) {
        hits.push({
          kind: 'category',
          id: cat._id,
          name: cat.name,
          count: cat.courseCount ?? 0,
          cat,
        });
      }
      for (const sub of cat.subcategories ?? []) {
        const subNameHit = sub.name.toLowerCase().includes(q);
        if (subNameHit) {
          hits.push({
            kind: 'sub',
            id: sub._id,
            name: sub.name,
            count: sub.courseCount ?? 0,
            cat,
            sub,
          });
        }
        for (const topic of sub.topics ?? []) {
          if (!subNameHit && !topic.name.toLowerCase().includes(q)) continue;
          hits.push({
            kind: 'topic',
            id: topic._id,
            name: topic.name,
            count: topic.courseCount ?? 0,
            cat,
            sub,
            topic,
          });
        }
      }
    }
    // اولویت: تطابق دقیق‌تر، سپس دسته، زیردسته، موضوع
    return hits.sort((a, b) => this.hitScore(b, q) - this.hitScore(a, q)).slice(0, 15);
  });

  private hitScore(hit: SearchHit, q: string): number {
    const name = hit.name.toLowerCase();
    let score = hit.kind === 'category' ? 3 : hit.kind === 'sub' ? 2 : 1;
    if (name === q) score += 10;
    else if (name.startsWith(q)) score += 5;
    else if (name.includes(q)) score += 2;
    score += Math.min(hit.count ?? 0, 5000) / 100000;
    return score;
  }

  readonly groupedHits = computed(() => {
    const g = {
      category: [] as SearchHit[],
      sub: [] as SearchHit[],
      topic: [] as SearchHit[],
    };
    for (const h of this.searchHits()) g[h.kind].push(h);
    return g;
  });

  private readonly faCompact = new Intl.NumberFormat('fa-IR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  // ═══════════════════ Lifecycle ═══════════════════
  ngOnInit(): void {
    this.megaMenuService.loadMegaMenu().subscribe();

    this.searchSubject
      .pipe(debounceTime(180), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((q) => this.megaMenuService.setSearchQuery(q));

    if (typeof window !== 'undefined') {
      const mq = window.matchMedia(`(max-width: ${MegaMenuComponent.MOBILE_BP}px)`);
      this.mql = mq;
      this.isMobile.set(mq.matches);
      mq.addEventListener('change', this.onMqChange);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearAllTimers();
    this.mql?.removeEventListener('change', this.onMqChange);
    this.pageBackdrop.hide();
  }

  // ═══════════════════ Open / Close ═══════════════════
  open(pin = false): void {
    this.clearCloseTimer();
    this.isOpen.set(true);
    // در موبایل همیشه pin می‌شود تا با حرکت انگشت/کلیک بیرون بسته نشود
    this.pinned.set(pin || this.isMobile());

    // 🪟 پوشش تیره‌ی صفحه (فقط دسکتاپ) — روی <body> رندر می‌شود تا
    //    محتوای زیر پنل کاملاً پنهان شود و ظاهر زشت ایجاد نکند.
    if (!this.isMobile()) this.pageBackdrop.show(40);

    setTimeout(() => {
      const cats = this.categories();
      if (cats.length > 0 && !this.selectedCategory()) {
        this.selectedCategory.set(cats[0]);
      }
      // در موبایل، پنل داخل drawer اسکرول‌پذیر است؛
      // آن را به دید کاربر بیاور وگرنه زیر صفحه پنهان می‌ماند.
      // ۴۰۰ms صبر می‌کنیم تا انیمیشن ورود کامل شود و transform بزرگ‌نمایی
      // روی محاسبه‌ی موقعیت اثر نگذارد.
      if (this.isMobile()) setTimeout(() => this.scrollPanelIntoView(), 400);
    }, 120);
  }

  /**
   * در موبایل، پنل داخل drawer والد (که overflow-y:auto دارد) قرار می‌گیرد.
   * ارتفاع پنل را با فضای واقعی اسکرولر تطبیق می‌دهیم و سپس اسکرولر را
   * طوری اسکرول می‌کنیم که پنل از بالا دیده شود.
   */
  private scrollPanelIntoView(): void {
    const el = this.mmPanel?.nativeElement;
    if (!el || typeof window === 'undefined') return;

    // نزدیک‌ترین اسکرول‌پذیر والد
    let scroller: HTMLElement | null = el.parentElement;
    while (scroller) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll|overlay)/.test(style.overflowY)) break;
      scroller = scroller.parentElement;
    }
    if (!scroller) return;

    // ❗ ارتفاع پنل نباید از فضای اسکرولر بیشتر شود، وگرنه
    //    نیمه‌ی پایینی آن (فوتر + آکاردئون‌ها) از صفحه بیرون می‌ماند.
    const available = scroller.clientHeight - 8;
    if (available > 160) el.style.maxHeight = `${available}px`;

    // اسکرولر را طوری جابه‌جا کن که لبه‌ی بالای پنل در دید قرار گیرد
    const target = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const desired = Math.max(0, scroller.scrollTop + target - 6);
    if (Math.abs(desired - scroller.scrollTop) < 2) return;
    scroller.scrollTop = desired;
  }

  close(): void {
    this.isOpen.set(false);
    this.pinned.set(false);
    this.expandedId.set(null);
    this.searchQuery.set('');
    this.megaMenuService.clearSearch();
    this.clearAllTimers();
    this.pageBackdrop.hide();
    // پاک کردن ارتفاع inline که در موبایل ست شده بود
    if (this.mmPanel) this.mmPanel.nativeElement.style.maxHeight = '';
  }

  toggle(): void {
    this.isOpen() ? this.close() : this.open(true);
  }

  selectCategory(cat: MegaCategory): void {
    this.selectedCategory.set(cat);
  }

  onWrapperEnter(): void {
    if (this.isMobile()) return;
    this.clearCloseTimer();
  }

  onWrapperLeave(): void {
    if (this.isMobile()) return;
    if (this.isOpen() && !this.pinned()) {
      this.clearCloseTimer();
      this.closeTimer = setTimeout(() => this.close(), this.CLOSE_DELAY);
    }
  }

  private clearCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearCloseTimer();
  }

  // ═══════════════════ Mobile Accordion ═══════════════════
  toggleAccordion(id: string): void {
    const isClosing = this.expandedId() === id;
    this.expandedId.set(isClosing ? null : id);
    // بعد از انیمیشن باز شدن، اگر پنل از دید خارج بود اسکرول کن
    if (!isClosing && this.isMobile()) {
      setTimeout(() => this.scrollPanelIntoView(), 500);
    }
  }

  // ═══════════════════ Search ═══════════════════
  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  clearSearchInput(): void {
    this.searchQuery.set('');
    this.megaMenuService.clearSearch();
  }

  pickHit(hit: SearchHit): void {
    if (hit.kind === 'category') this.navigateToCategory(hit.cat);
    else if (hit.kind === 'sub' && hit.sub) this.navigateToSubcategory(hit.cat, hit.sub);
    else if (hit.kind === 'topic' && hit.sub && hit.topic)
      this.navigateToTopic(hit.cat, hit.sub, hit.topic);
  }

  // ═══════════════════ Navigation ═══════════════════
  /**
   * بعد از هر ناوبری، مگامنو بسته می‌شود.
   * در موبایل، والد (navbar) هم باید drawer را ببندد — از طریق یک event خروجی.
   */
  private finishNavigation(): void {
    this.close();
    this.navigated.emit();
  }

  navigateToCategory(cat: MegaCategory): void {
    this.megaMenuService.addRecentCategory({
      _id: cat._id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      gradient: cat.gradient,
    });
    this.router.navigate(['/courses'], { queryParams: { category: cat.slug } });
    this.finishNavigation();
  }

  navigateToSubcategory(cat: MegaCategory, sub: MegaSubCategory): void {
    this.megaMenuService.addRecentCategory({
      _id: sub._id,
      name: sub.name,
      slug: sub.slug,
      icon: cat.icon,
      gradient: cat.gradient,
    });
    this.router.navigate(['/courses'], {
      queryParams: { category: cat.slug, sub: sub.slug },
    });
    this.finishNavigation();
  }

  navigateToTopic(cat: MegaCategory, sub: MegaSubCategory, topic: MegaTopic): void {
    this.router.navigate(['/courses'], {
      queryParams: { category: cat.slug, sub: sub.slug, topic: topic.slug },
    });
    this.finishNavigation();
  }

  navigateToAllCourses(): void {
    this.router.navigate(['/courses']);
    this.finishNavigation();
  }

  navigateRecent(r: RecentCategory): void {
    this.router.navigate(['/courses'], { queryParams: { category: r.slug } });
    this.finishNavigation();
  }

  onQuick(kind: 'newest' | 'popular' | 'free'): void {
    const queryParams = kind === 'free' ? { isFree: true } : { sort: kind };
    this.router.navigate(['/courses'], { queryParams });
    this.finishNavigation();
  }

  onQuickPopularInCategory(cat: MegaCategory): void {
    this.router.navigate(['/courses'], {
      queryParams: { category: cat.slug, sort: 'popular' },
    });
    this.finishNavigation();
  }

  goToCertificates(): void {
    this.router.navigate(['/courses'], { queryParams: { certificate: true } });
    this.finishNavigation();
  }

  clearRecents(event: Event): void {
    event.stopPropagation();
    this.megaMenuService.clearRecents();
  }

  // ═══════════════════ Keyboard A11y ═══════════════════
  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.isOpen()) return;

    const cats = this.categories();
    const selected = this.selectedCategory();
    const typing = this.searchBox && document.activeElement === this.searchBox.nativeElement;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        // در موبایل اول آکاردئون باز را ببند، بعد خود پنل
        if (this.isMobile() && this.expandedId()) {
          this.expandedId.set(null);
        } else {
          this.close();
        }
        break;

      case 'ArrowDown':
      case 'ArrowUp': {
        if (this.isMobile() || cats.length === 0) return;
        event.preventDefault();
        const idx = selected ? cats.indexOf(selected) : -1;
        const next =
          event.key === 'ArrowDown'
            ? cats[Math.min(idx + 1, cats.length - 1)]
            : cats[Math.max(idx - 1, 0)];
        if (next) this.selectedCategory.set(next);
        break;
      }

      case 'Enter': {
        if (this.isMobile()) return;
        event.preventDefault();
        if (typing && this.searchHits().length > 0) {
          this.pickHit(this.searchHits()[0]);
        } else if (selected) {
          this.navigateToCategory(selected);
        }
        break;
      }

      case '/':
        if (!typing) {
          event.preventDefault();
          this.searchBox?.nativeElement.focus();
        }
        break;
    }
  }

  // ═══════════════════ Helpers ═══════════════════
  faNum(n?: number): string {
    return (n ?? 0).toLocaleString('fa-IR');
  }

  compactCount(n?: number): string {
    return this.faCompact.format(n ?? 0);
  }

  topTopics(sub: MegaSubCategory): MegaTopic[] {
    return (sub.topics ?? []).slice(0, 4);
  }

  /** فقط موضوعات واقعی با isHot از API */
  hotTopicsOf(cat: MegaCategory | null): HotTopic[] {
    if (!cat) return [];
    const out: HotTopic[] = [];
    for (const sub of cat.subcategories ?? []) {
      for (const topic of sub.topics ?? []) {
        if (topic.isHot) out.push({ topic, sub });
        if (out.length >= 3) return out;
      }
    }
    return out;
  }

  categoryGlow(cat: MegaCategory): string {
    return (cat as any).color || '#8b5cf6';
  }
}
