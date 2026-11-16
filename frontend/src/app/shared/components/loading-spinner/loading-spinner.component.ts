import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export type OverlayMode = boolean | 'fullscreen' | 'container';
export type SpinnerColor = 'primary' | 'accent' | 'warn' | 'white';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './loading-spinner.component.html',
  styleUrl: './loading-spinner.component.scss',
})
export class LoadingSpinnerComponent implements OnChanges, OnDestroy {
  @Input() diameter = 48;
  @Input() strokeWidth = 4;
  @Input() message = 'در حال بارگذاری';
  @Input() subMessage = '';
  @Input() overlay: OverlayMode = false;
  @Input() color: SpinnerColor = 'primary';
  @Input() showCard = true;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  get isFullscreen(): boolean {
    return this.overlay === true || this.overlay === 'fullscreen';
  }

  get isContainerOverlay(): boolean {
    return this.overlay === 'container';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['overlay']) {
      this.toggleBodyScroll();
    }
  }

  ngOnDestroy(): void {
    this.removeScrollLock();
  }

  private toggleBodyScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      if (this.isFullscreen) {
        document.body.classList.add('spinner-scroll-lock');
      } else {
        document.body.classList.remove('spinner-scroll-lock');
      }
    }
  }

  private removeScrollLock(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.classList.remove('spinner-scroll-lock');
    }
  }
}
