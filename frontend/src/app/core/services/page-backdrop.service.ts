import { Injectable, OnDestroy } from '@angular/core';

const HOST_ATTR = 'data-page-backdrop';
const STYLE_ID = 'page-backdrop-style';

/**
 * استایل پوشش که به <head> تزریق می‌شود.
 *
 * چرا <head> و نه component stylesheet؟
 *  - عنصر پوشش در <body> و بیرون از هر component ایجاد می‌شود، پس
 *    stylesheet کامپوننتی (که scope دارد) روی آن اعمال نمی‌شود.
 *  - استفاده از !important تضمین می‌کند که قاعده‌ی سراسری
 *    `body, body * { transition: ... !important }` در styles.scss
 *    نتواند رفتار پوشش را خراب کند.
 */
const BACKDROP_CSS = `
[data-page-backdrop] {
  position: fixed !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
  z-index: 40 !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  pointer-events: none !important;
  /* مات و تیره - محتوای زیر پنل کاملا پنهان مي‌شود */
  background: linear-gradient(180deg, rgba(5, 5, 10, 0.94) 0%, rgba(5, 5, 10, 0.9) 100%) !important;
  backdrop-filter: saturate(60%) brightness(40%) !important;
  -webkit-backdrop-filter: saturate(60%) brightness(40%) !important;
  animation: page-backdrop-in 200ms cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
}
[data-page-backdrop].is-closing {
  animation: page-backdrop-out 170ms cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
}
@keyframes page-backdrop-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes page-backdrop-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
`;

/**
 * 🪟 سرویس Backdrop سراسری
 * ============================================================================
 * چرا این سرویس وجود دارد?
 * ----------------------------------------------------------------------------
 * والد نوار بالا (`header.navbar-wrapper`) از `backdrop-filter` استفاده می‌کند.
 * بر اساس مشخصات CSS، `backdrop-filter` روی یک عنصر، آن عنصر را به
 * **containing block** برای فرزندان `position: fixed` تبدیل می‌کند.
 *
 * نتیجه: overlay با `position: fixed; inset: 0` که داخل چنین والدی رندر شود,
 * به‌جای کل صفحه، فقط هم‌اندازه‌ی همان والد (72px ارتفاع نوار بالا) می‌شود و
 * عملا هیچ چیز را پنهان نمی‌کند — محتوای زیر منو کاملاً دیده می‌شود.
 *
 * ✅ راه‌حل: رندر پوشش مستقیماً روی `<body>`، دور از هر والدی که
 *    `backdrop-filter` / `transform` / `filter` / `will-change` دارد.
 *
 * 🎨 چرا مات و تیره?
 * ----------------------------------------------------------------------------
 * گزارش کاربر: «محتوای زیر مگامنو دیده می‌شود و ظاهر زشتی ایجاد می‌کند».
 * بنابراین به‌جای scrim نیمه‌شفاف (که محتوا را «نشان» می‌دارد)، یک پوشش
 * مات و تیره استفاده می‌شود تا تمرکز کامل روی پنل باشد.
 * ============================================================================
 */
@Injectable({ providedIn: 'root' })
export class PageBackdropService implements OnDestroy {
  private host: HTMLElement | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * پوشش تیره‌ی صفحه را ایجاد می‌کند.
   * @param zIndex لایه‌ی نمایش — کمتر از z-index پنل، بیشتر از محتوای صفحه
   */
  show(zIndex = 40): void {
    if (typeof document === 'undefined') return;
    this.clearRemoveTimer();
    this.hideNow();
    this.ensureStyle(zIndex);

    // ✅ ریشه‌ی پوشش روی <body> سوار می‌شود تا از هر containing block
    //    که backdrop-filter یا transform دارد بیرون بماند.
    const host = document.createElement('div');
    host.setAttribute(HOST_ATTR, '');
    document.body.appendChild(host);
    this.host = host;
  }

  /** استایل را یک‌بار به <head> تInject می‌کند. */
  private ensureStyle(zIndex: number): void {
    if (typeof document === 'undefined') return;
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    if (!styleEl.textContent || !styleEl.textContent.includes('page-backdrop-in')) {
      styleEl.textContent = BACKDROP_CSS.replace('z-index: 40', `z-index: ${zIndex}`);
    }
  }

  /** پوشش را با انیمیشن خارج و حذف کامل. */
  hide(): void {
    const host = this.host;
    if (!host) return;
    host.classList.add('is-closing');
    this.clearRemoveTimer();
    this.removeTimer = setTimeout(() => this.hideNow(), 190);
  }

  /** حذف فوری بدون انیمیشن. */
  private hideNow(): void {
    const host = this.host;
    this.host = null;
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }

  private clearRemoveTimer(): void {
    if (this.removeTimer) {
      clearTimeout(this.removeTimer);
      this.removeTimer = null;
    }
  }

  get isVisible(): boolean {
    return this.host !== null;
  }

  ngOnDestroy(): void {
    this.clearRemoveTimer();
    this.hideNow();
  }
}
