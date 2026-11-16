import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  signal,
  computed,
  effect,
  inject,
  PLATFORM_ID,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface ImageItem {
  id: string;
  url: string;
  title?: string;
  description?: string;
  order: number;
  thumbnailUrl?: string;
}

@Component({
  selector: 'app-image-viewer',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './image-viewer.component.html',
  styleUrl: './image-viewer.component.scss',
})
export class ImageViewerComponent implements OnInit, OnDestroy, OnChanges {
  private platformId = inject(PLATFORM_ID);

  @Input() images: ImageItem[] = [];
  @Input() initialIndex = 0;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();
  @Output() indexChanged = new EventEmitter<number>();

  isBrowser = isPlatformBrowser(this.platformId);

  // ✅ Separate signal for current index (don't mutate @Input)
  currentIndex = signal(0);

  // Zoom state
  zoomLevel = signal(1);
  readonly minZoom = 0.25;
  readonly maxZoom = 4;
  readonly zoomStep = 0.25;

  // Image loading state
  isLoading = signal(true);
  loadError = signal(false);
  naturalWidth = signal(0);
  naturalHeight = signal(0);

  // Pan state
  panX = signal(0);
  panY = signal(0);
  isPanning = signal(false);
  private panStartX = 0;
  private panStartY = 0;

  // Touch state
  private touchStartDistance = 0;
  private touchStartZoom = 1;
  private lastTouchCenter = { x: 0, y: 0 };

  // Computed
  currentImage = computed(() => this.images[this.currentIndex()] || null);
  totalImages = computed(() => this.images.length);
  zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  canZoomIn = computed(() => this.zoomLevel() < this.maxZoom);
  canZoomOut = computed(() => this.zoomLevel() > this.minZoom);
  canGoPrevious = computed(() => this.currentIndex() > 0);
  canGoNext = computed(() => this.currentIndex() < this.images.length - 1);

  containerWidth = signal(0);
  containerHeight = signal(0);

  ngOnChanges(changes: SimpleChanges): void {
    // Sync input index to internal signal
    if (changes['initialIndex'] && typeof this.initialIndex === 'number') {
      this.currentIndex.set(
        Math.max(0, Math.min(this.initialIndex, this.images.length - 1))
      );
      this.resetZoom();
      this.isLoading.set(true);
      this.loadError.set(false);
    }

    // When opened — lock scroll & reset state
    if (changes['isOpen']) {
      if (this.isOpen) {
        this.lockScroll();
        this.resetZoom();
        this.isLoading.set(true);
        this.loadError.set(false);
      } else {
        this.unlockScroll();
      }
    }

    // Reset if images collection changes
    if (changes['images']) {
      this.currentIndex.set(
        Math.max(0, Math.min(this.initialIndex || 0, (this.images?.length || 1) - 1))
      );
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'ArrowLeft':
        // RTL: ArrowLeft goes to next
        event.preventDefault();
        this.goNext();
        break;
      case 'ArrowRight':
        // RTL: ArrowRight goes to previous
        event.preventDefault();
        this.goPrevious();
        break;
      case '+':
      case '=':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.zoomIn();
        }
        break;
      case '-':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.zoomOut();
        }
        break;
      case '0':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.resetZoom();
        }
        break;
    }
  }

  ngOnInit(): void {
    if (this.isOpen) this.lockScroll();
    this.currentIndex.set(
      Math.max(0, Math.min(this.initialIndex || 0, (this.images?.length || 1) - 1))
    );
  }

  ngOnDestroy(): void {
    this.unlockScroll();
  }

  private lockScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = 'hidden';
    }
  }

  private unlockScroll(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }

  // ─── Zoom ───
  zoomIn(): void {
    if (this.canZoomIn()) {
      this.zoomLevel.update((v) => Math.min(this.maxZoom, v + this.zoomStep));
      if (this.zoomLevel() <= 1) this.resetPan();
    }
  }

  zoomOut(): void {
    if (this.canZoomOut()) {
      this.zoomLevel.update((v) => Math.max(this.minZoom, v - this.zoomStep));
      if (this.zoomLevel() <= 1) this.resetPan();
    }
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
    this.resetPan();
  }

  setZoom(level: number): void {
    const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, level));
    this.zoomLevel.set(clamped);
    if (clamped <= 1) this.resetPan();
  }

  resetPan(): void {
    this.panX.set(0);
    this.panY.set(0);
  }

  // ─── Image events ───
  onImageLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.naturalWidth.set(img.naturalWidth);
    this.naturalHeight.set(img.naturalHeight);
    this.isLoading.set(false);
    this.loadError.set(false);
  }

  onImageError(): void {
    this.isLoading.set(false);
    this.loadError.set(true);
  }

  retryLoad(): void {
    this.loadError.set(false);
    this.isLoading.set(true);
    // Force re-fetch by changing index trigger (same image)
    const i = this.currentIndex();
    this.currentIndex.set(-1);
    setTimeout(() => this.currentIndex.set(i), 10);
  }

  // ─── Mouse ───
  onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      event.deltaY < 0 ? this.zoomIn() : this.zoomOut();
    } else if (this.zoomLevel() > 1) {
      if (event.shiftKey) {
        event.preventDefault();
        this.panX.update((x) => x - event.deltaY * 0.5);
      } else {
        event.preventDefault();
        this.panY.update((y) => y - event.deltaY * 0.5);
      }
    }
  }

  onMouseDown(event: MouseEvent): void {
    if (this.zoomLevel() > 1 && event.button === 0) {
      event.preventDefault();
      this.isPanning.set(true);
      this.panStartX = event.clientX - this.panX();
      this.panStartY = event.clientY - this.panY();
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isPanning()) {
      this.panX.set(event.clientX - this.panStartX);
      this.panY.set(event.clientY - this.panStartY);
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isPanning()) this.isPanning.set(false);
  }

  // ─── Touch ───
  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      if (this.zoomLevel() > 1) {
        this.isPanning.set(true);
        this.panStartX = event.touches[0].clientX - this.panX();
        this.panStartY = event.touches[0].clientY - this.panY();
      }
    } else if (event.touches.length === 2) {
      this.isPanning.set(false);
      const [t1, t2] = [event.touches[0], event.touches[1]];
      this.touchStartDistance = Math.hypot(
        t2.clientX - t1.clientX,
        t2.clientY - t1.clientY
      );
      this.touchStartZoom = this.zoomLevel();
      this.lastTouchCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 1 && this.isPanning() && this.zoomLevel() > 1) {
      event.preventDefault();
      const t = event.touches[0];
      this.panX.set(t.clientX - this.panStartX);
      this.panY.set(t.clientY - this.panStartY);
    } else if (event.touches.length === 2) {
      event.preventDefault();
      const [t1, t2] = [event.touches[0], event.touches[1]];
      const currentDistance = Math.hypot(
        t2.clientX - t1.clientX,
        t2.clientY - t1.clientY
      );
      if (this.touchStartDistance > 0) {
        const scale = currentDistance / this.touchStartDistance;
        this.setZoom(this.touchStartZoom * scale);
      }
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) this.touchStartDistance = 0;
    if (event.touches.length === 0) this.isPanning.set(false);
  }

  // ─── Navigation ───
  goPrevious(): void {
    if (this.canGoPrevious()) {
      this.currentIndex.update((i) => i - 1);
      this.resetZoom();
      this.isLoading.set(true);
      this.loadError.set(false);
      this.indexChanged.emit(this.currentIndex());
    }
  }

  goNext(): void {
    if (this.canGoNext()) {
      this.currentIndex.update((i) => i + 1);
      this.resetZoom();
      this.isLoading.set(true);
      this.loadError.set(false);
      this.indexChanged.emit(this.currentIndex());
    }
  }

  goToIndex(index: number): void {
    if (index >= 0 && index < this.images.length) {
      this.currentIndex.set(index);
      this.resetZoom();
      this.isLoading.set(true);
      this.loadError.set(false);
      this.indexChanged.emit(this.currentIndex());
    }
  }

  // ─── Download ───
  downloadImage(): void {
    const image = this.currentImage();
    if (!image || !isPlatformBrowser(this.platformId)) return;

    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.title || `image-${image.order || image.id}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  close(): void {
    this.unlockScroll();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  getImageTransform(): string {
    return `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoomLevel()})`;
  }

  trackByImageId(_: number, img: ImageItem): string {
    return img.id;
  }
}