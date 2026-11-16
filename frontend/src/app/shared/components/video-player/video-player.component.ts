import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  inject,
  PLATFORM_ID,
  HostListener,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { DurationPipe } from '../../pipes/duration.pipe';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatMenuModule, DurationPipe],
  templateUrl: './video-player.component.html',
  styleUrl: './video-player.component.scss',
})
export class VideoPlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private platformId = inject(PLATFORM_ID);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('progressBar') progressBar!: ElementRef<HTMLDivElement>;

  @Input() videoUrl = '';
  @Input() poster = '';
  @Input() title = '';
  @Input() autoplay = false;
  @Input() initialPosition = 0;
  @Input() startAt = 0;

  @Output() progressUpdate = new EventEmitter<{ position: number; duration: number }>();
  @Output() completed = new EventEmitter<void>();
  @Output() urlExpired = new EventEmitter<void>();

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  volume = 1;
  isMuted = false;
  playbackRate = 1;
  isFullscreen = false;
  showControls = true;
  isBuffering = false;
  bufferedPercent = 0;

  videoError = signal(false);
  errorMessage = signal('');
  retryCount = 0;
  private maxRetries = 2;
  private hasEmittedExpired = false;

  isHoveringProgress = false;
  hoverPositionPercent = 0;
  hoverTime = 0;

  feedbackIcon = signal<string | null>(null);

  speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  private controlsTimeout: any;
  private progressInterval: any;
  private feedbackTimeout: any;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const video = this.videoElement?.nativeElement;
    if (!video) return;

    this.setupVideoListeners(video);

    if (this.videoUrl && this.videoUrl.trim() !== '' && this.videoUrl !== 'undefined' && !this.videoUrl.includes('/undefined')) {
      video.load();
      if (this.autoplay) {
        this.playVideoSafely();
      }
    }

    this.progressInterval = setInterval(() => {
      if (this.isPlaying) {
        this.progressUpdate.emit({
          position: Math.floor(this.currentTime),
          duration: Math.floor(this.duration),
        });
      }
    }, 10000);

    document.addEventListener('fullscreenchange', () => {
      this.isFullscreen = !!document.fullscreenElement;
    });
  }

  private setupVideoListeners(video: HTMLVideoElement): void {
    video.addEventListener('loadedmetadata', () => {
      this.duration = video.duration;
      const startPosition = this.startAt > 0 ? this.startAt : this.initialPosition;
      if (startPosition > 0) {
        video.currentTime = startPosition;
      }
      this.videoError.set(false);
      this.errorMessage.set('');
    });

    video.addEventListener('timeupdate', () => {
      this.currentTime = video.currentTime;
      this.updateBuffered();
    });

    video.addEventListener('progress', () => {
      this.updateBuffered();
    });

    video.addEventListener('ended', () => {
      this.isPlaying = false;
      this.completed.emit();
    });

    video.addEventListener('waiting', () => (this.isBuffering = true));
    video.addEventListener('canplay', () => {
      this.isBuffering = false;
      this.retryCount = 0;
      this.hasEmittedExpired = false;
      this.videoError.set(false);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['videoUrl']) {
      const currentUrl = changes['videoUrl'].currentValue;
      if (!currentUrl || currentUrl.trim() === '' || currentUrl === 'undefined' || currentUrl.includes('/undefined')) {
        console.warn('[VideoPlayer] ⚠️ Skipping invalid videoUrl:', currentUrl);
        return;
      }

      this.videoError.set(false);
      this.errorMessage.set('');
      this.retryCount = 0;
      this.hasEmittedExpired = false;

      setTimeout(() => {
        const video = this.videoElement?.nativeElement;
        if (video) {
          video.load();
          if (this.autoplay) {
            this.playVideoSafely();
          }
        }
      }, 50);
    }
  }

  ngOnDestroy(): void {
    if (this.progressInterval) clearInterval(this.progressInterval);
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    if (this.feedbackTimeout) clearTimeout(this.feedbackTimeout);
  }

  /**
   * 🔒 جلوگیری از منوی راست‌کلیک روی ویدیو
   * اگر منوی «دانلود ویدیو / ذخیره تصویر / کپی آدرس» باز شود، کاربر می‌تواند
   * فایل را مستقیماً ذخیره کند — حتی اگر لینک داخلی باشد.
   */
  onContextMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  async onVideoError(event: Event): Promise<void> {
    // اگر URL خالی است، این ارور کاذب است و نادیده گرفته می‌شود
    if (!this.videoUrl || this.videoUrl.trim() === '') {
      return;
    }

    const video = event.target as HTMLVideoElement;
    const error = video?.error;
    const code = error?.code || 0;
    const msg = error?.message || '';
    
    console.warn(`[VideoPlayer] Video error: code=${code} msg=${msg}`);
    this.isPlaying = false;

    // بررسی خطای ۴۰۳ و انقضای توکن
    if ((code === 2 || code === 4) && !this.hasEmittedExpired) {
      const isExpired = await this.checkIfUrlExpired(this.videoUrl);
      if (isExpired) {
        console.log('[VideoPlayer] ✅ URL منقضی شده یا دسترسی محدود است — دریافت URL تازه');
        this.hasEmittedExpired = true;
        this.urlExpired.emit();
        return;
      }
      
      // If checkIfUrlExpired returned false (e.g., 404), don't retry - show error
      const errorMessages: Record<number, string> = {
        1: 'بارگذاری ویدیو لغو شد.',
        2: 'خطای شبکه در دریافت ویدیو. اتصال اینترنت خود را بررسی کنید.',
        3: 'ویدیو قابل رمزگشایی نیست.',
        4: 'فرمت ویدیو یا دسترسی به سرور با مشکل مواجه شد.',
      };
      
      this.errorMessage.set(errorMessages[code] || `خطا در پخش ویدیو (${code})`);
      this.videoError.set(true);
      return;
    }

    if (code === 2 && this.retryCount < this.maxRetries) {
      this.retryCount++;
      setTimeout(() => {
        const v = this.videoElement?.nativeElement;
        if (v) v.load();
      }, 1500 * this.retryCount);
      return;
    }

    const errorMessages: Record<number, string> = {
      1: 'بارگذاری ویدیو لغو شد.',
      2: 'خطای شبکه در دریافت ویدیو. اتصال اینترنت خود را بررسی کنید.',
      3: 'ویدیو قابل رمزگشایی نیست.',
      4: 'فرمت ویدیو یا دسترسی به سرور با مشکل مواجه شد.',
    };

    this.errorMessage.set(errorMessages[code] || `خطا در پخش ویدیو (${code})`);
    this.videoError.set(true);
  }

private async checkIfUrlExpired(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { method: 'HEAD', mode: 'cors', signal: controller.signal });
    clearTimeout(timeoutId);
    
    // 404 = Not Found (video doesn't exist) - NOT expired, don't retry
    // 401/403 = Unauthorized/Forbidden (token expired or no access) - IS expired, should refresh
    if (response.status === 404) {
      console.warn('[VideoPlayer] ⚠️ Video not found (404):', url);
      return false; // Don't treat 404 as expired - video simply doesn't exist
    }
    
    // 401, 403, 410 = expired/unauthorized - should refresh
    if (response.status === 401 || response.status === 403 || response.status === 410) {
      console.log('[VideoPlayer] ✅ URL expired/unauthorized:', response.status);
      return true;
    }
    
    // Other non-OK statuses - treat as expired to be safe
    return !response.ok;
  } catch (err: any) {
    // AbortError = timeout, TypeError = CORS/network error
    // هر دو حالت نشان‌دهنده منقضی یا غیرقابل دسترس بودن URL هستند
    console.warn('[VideoPlayer] ⚠️ URL expired/unreachable:', err?.message || err);
    return true;
  }
}

  retryLoad(): void {
    this.videoError.set(false);
    this.errorMessage.set('');
    this.retryCount = 0;
    this.hasEmittedExpired = false;
    const video = this.videoElement?.nativeElement;
    if (video && this.videoUrl) {
      video.load();
      this.playVideoSafely();
    }
  }

  private playVideoSafely(): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
        })
        .catch(() => {
          this.isPlaying = false;
        });
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    switch (event.key.toLowerCase()) {
      case ' ':
      case 'k':
        event.preventDefault();
        this.togglePlay();
        break;
      case 'f':
        event.preventDefault();
        this.toggleFullscreen();
        break;
      case 'm':
        event.preventDefault();
        this.toggleMute();
        break;
      case 'arrowleft':
      case 'j':
        event.preventDefault();
        this.skip(-10);
        break;
      case 'arrowright':
      case 'l':
        event.preventDefault();
        this.skip(10);
        break;
      case 'arrowup':
        event.preventDefault();
        this.setVolume(Math.min(1, this.volume + 0.1));
        break;
      case 'arrowdown':
        event.preventDefault();
        this.setVolume(Math.max(0, this.volume - 0.1));
        break;
    }
  }

  togglePlay(): void {
    const video = this.videoElement?.nativeElement;
    if (!video || this.videoError()) return;

    if (video.paused) {
      this.playVideoSafely();
      this.triggerFeedback('play_arrow');
    } else {
      video.pause();
      this.isPlaying = false;
      this.triggerFeedback('pause');
    }
  }

  skip(seconds: number): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;

    video.currentTime = Math.max(0, Math.min(this.duration, video.currentTime + seconds));
    this.currentTime = video.currentTime;
    this.triggerFeedback(seconds > 0 ? 'forward_10' : 'replay_10');
  }

  onProgressClick(event: MouseEvent): void {
    const rect = this.progressBar.nativeElement.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    const seekTime = Math.max(0, Math.min(this.duration, pos * this.duration));

    const video = this.videoElement?.nativeElement;
    if (video) {
      video.currentTime = seekTime;
      this.currentTime = seekTime;
    }
  }

  onProgressMouseMove(event: MouseEvent): void {
    const rect = this.progressBar.nativeElement.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    this.isHoveringProgress = true;
    this.hoverPositionPercent = pos * 100;
    this.hoverTime = pos * this.duration;
  }

  onProgressMouseLeave(): void {
    this.isHoveringProgress = false;
  }

  setVolume(newVolume: number): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;

    this.volume = newVolume;
    video.volume = newVolume;
    this.isMuted = newVolume === 0;
    video.muted = this.isMuted;
  }

  toggleMute(): void {
    const video = this.videoElement?.nativeElement;
    if (!video) return;

    this.isMuted = !this.isMuted;
    video.muted = this.isMuted;
    if (!this.isMuted && this.volume === 0) {
      this.setVolume(0.5);
    }
  }

  setSpeed(speed: number): void {
    this.playbackRate = speed;
    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.playbackRate = speed;
    }
  }

  async togglePictureInPicture(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const video = this.videoElement?.nativeElement as any;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('Picture-in-Picture error:', err);
    }
  }

  toggleFullscreen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const container = this.videoElement?.nativeElement?.parentElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  onMouseMove(): void {
    this.showControls = true;
    clearTimeout(this.controlsTimeout);
    this.controlsTimeout = setTimeout(() => {
      if (this.isPlaying) this.showControls = false;
    }, 3000);
  }

  private updateBuffered(): void {
    const video = this.videoElement?.nativeElement;
    if (!video || !video.buffered.length || this.duration === 0) return;

    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    this.bufferedPercent = Math.min(100, (bufferedEnd / this.duration) * 100);
  }

  private triggerFeedback(icon: string): void {
    this.feedbackIcon.set(icon);
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => {
      this.feedbackIcon.set(null);
    }, 500);
  }

  get progressPercent(): number {
    return this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
  }

  get volumeIcon(): string {
    if (this.isMuted || this.volume === 0) return 'volume_off';
    if (this.volume < 0.4) return 'volume_mute';
    if (this.volume < 0.8) return 'volume_down';
    return 'volume_up';
  }
}