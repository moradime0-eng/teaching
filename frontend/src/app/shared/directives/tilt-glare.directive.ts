import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  NgZone,
} from '@angular/core';

@Directive({
  selector: '[tiltGlare]',
  standalone: true,
})
export class TiltGlareDirective implements OnInit, OnDestroy {
  readonly intensity = input<number>(18);
  readonly perspective = input<number>(700);
  readonly scale = input<number>(1.03);
  readonly lift = input<number>(6);

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);

  private rx = 0; private ry = 0; private trx = 0; private try_ = 0;
  private sc = 1; private tsc = 1;
  private raf: number | null = null;
  private hovering = false;

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const host = this.el.nativeElement;
    
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.style.transformStyle = 'preserve-3d';
    host.style.willChange = 'transform';

    this.bindEvents();
  }

  private bindEvents(): void {
    const host = this.el.nativeElement;
    this.zone.runOutsideAngular(() => {
      host.addEventListener('pointerenter', this.onEnter, { passive: true });
      host.addEventListener('pointermove', this.onMove, { passive: true });
      host.addEventListener('pointerleave', this.onLeave, { passive: true });
    });
  }

  private readonly onEnter = (): void => {
    this.hovering = true;
    this.tsc = this.scale();
    this.el.nativeElement.style.setProperty('transition', 'transform 0s', 'important');
    this.queue();
  };

  private readonly onMove = (e: PointerEvent): void => {
    const rect = this.el.nativeElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const k = this.intensity();

    // فرمول معکوس برای فرو رفتن گوشه‌ها
    this.try_ = (0.5 - px) * k; 
    this.trx = (py - 0.5) * k;  

    this.queue();
  };

  private readonly onLeave = (): void => {
    this.hovering = false;
    this.trx = 0;
    this.try_ = 0;
    this.tsc = 1;
    this.el.nativeElement.style.setProperty('transition', 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)', 'important');
    this.queue();
  };

  private queue(): void {
    if (this.raf !== null) return;
    this.zone.runOutsideAngular(() => {
      this.raf = requestAnimationFrame(this.tick);
    });
  }

  private readonly tick = (): void => {
    const ease = this.hovering ? 0.2 : 0.1;
    this.rx += (this.trx - this.rx) * ease;
    this.ry += (this.try_ - this.ry) * ease;
    this.sc += (this.tsc - this.sc) * ease;

    const liftY = this.hovering ? -this.lift() : 0;

    // 🚀 تغییر اصلی اینجاست: استفاده از setProperty با important برای شکستن قفل CSS Animation
    this.el.nativeElement.style.setProperty(
      'transform',
      `perspective(${this.perspective()}px) rotateX(${this.rx.toFixed(2)}deg) rotateY(${this.ry.toFixed(2)}deg) translateY(${liftY.toFixed(1)}px) scale3d(${this.sc.toFixed(3)}, ${this.sc.toFixed(3)}, 1)`,
      'important'
    );

    const settled =
      Math.abs(this.trx - this.rx) < 0.05 &&
      Math.abs(this.try_ - this.ry) < 0.05 &&
      Math.abs(this.tsc - this.sc) < 0.001;

    if (settled && !this.hovering) {
      this.el.nativeElement.style.removeProperty('transform');
      this.el.nativeElement.style.removeProperty('transition');
      this.raf = null;
    } else {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  ngOnDestroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    const host = this.el.nativeElement;
    host.removeEventListener('pointerenter', this.onEnter);
    host.removeEventListener('pointermove', this.onMove);
    host.removeEventListener('pointerleave', this.onLeave);
    host.style.removeProperty('transform');
  }
}