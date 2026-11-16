import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Fades + slides up an element when it enters the viewport.
 * Accepts a delay in milliseconds for staggered reveal animations.
 * Respects prefers-reduced-motion.
 */
@Directive({
  selector: '[appReveal]',
  standalone: true,
})
export class RevealDirective implements OnInit, OnDestroy {
  @Input() appReveal: number = 0; // delay in ms
  private el = inject(ElementRef<HTMLElement>);
  private obs?: IntersectionObserver;

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const node = this.el.nativeElement;

    if (prefersReduced) {
      // No animation — just show immediately
      return;
    }

    node.style.opacity = '0';
    node.style.transform = 'translateY(24px)';
    node.style.transition = `opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${this.appReveal}ms, transform 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${this.appReveal}ms`;

    this.obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            node.style.opacity = '1';
            node.style.transform = 'translateY(0)';
            this.obs?.unobserve(node);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    );
    this.obs.observe(node);
  }

  ngOnDestroy(): void {
    this.obs?.disconnect();
  }
}