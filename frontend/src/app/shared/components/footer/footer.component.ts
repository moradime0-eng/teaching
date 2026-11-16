import { Component, OnInit, AfterViewInit, Inject, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SettingsService } from '../../../core/services/settings.service';
import { CourseService } from '../../../core/services/course.service';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent implements OnInit, AfterViewInit {
  public settingsService = inject(SettingsService);
  private courseService = inject(CourseService);

  /**
   * دسته‌بندی‌های فوتر — کاملاً داینامیک از API.
   * ⚠️ قبلاً دسته‌بندی‌ها hardcode بودند (programming/ai/design/business/devops)
   * که با slug اشتباه لینک می‌شدند و با دیتابیس خالی هم باقی می‌ماندند.
   */
  readonly footerCategories = signal<Category[]>([]);
  readonly visibleCategories = computed(() => this.footerCategories().slice(0, 6));

  currentPersianYear = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(
    new Date(),
  );

  newsletterEmail = '';
  isSubscribed = false;

  // 📍 مختصات دقیق پلاس کد گوگل مپس (8GW6+5C7) - ساختمان خورشید، میدان امام حسن (ع)
  private readonly latitude = 32.34552;
  private readonly longitude = 51.50356;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    this.settingsService.loadSettings().subscribe();
    this.loadFooterCategories();
  }

  /** بارگذاری دسته‌بندی‌های ریشه از API (بدون داده static) */
  private loadFooterCategories(): void {
    this.courseService.getParentCategories().subscribe({
      next: (res) => {
        if (res.success && res.data) {
          this.footerCategories.set(res.data.filter((c) => c.isActive));
        }
      },
      error: () => {
        // در صورت خطا، فوتر بدون لینک دسته‌بندی نمایش داده می‌شود
        this.footerCategories.set([]);
      },
    });
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initMap();
    }
  }

  private async initMap(): Promise<void> {
    const leaflet = await import('leaflet');
    const L = (leaflet as any).default || leaflet;

    // تنظیم آیکون مارکر
    const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
    const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';
    const iconDefault = L.icon({
      iconUrl,
      shadowUrl,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    L.Marker.prototype.options.icon = iconDefault;

    // ایجاد نقشه دقیقاً روی ساختمان خورشید
    const map = L.map('footer-map', {
      center: [this.latitude, this.longitude],
      zoom: 17, // زوم دقیق‌تر برای نمایش کامل ساختمان و میدان
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false,
    });

    // بارگذاری تایلهای نقشه
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    // علامت‌گذاری دقیق موقعیت آموزشگاه روی ساختمان خورشید
    const marker = L.marker([this.latitude, this.longitude]).addTo(map);
    marker
      .bindPopup(
        `
      <div style="font-family: inherit; text-align: right; direction: rtl; padding: 2px;">
        <strong style="color: #4f46e5; font-size: 13px;">شرکت فناوری اطلاعات همایون اصفهان</strong><br>
        <span style="font-size: 11px; color: #334155;">مبارکه، بلوار ولایت، میدان امام حسن (ع)، ساختمان خورشید، طبقه ۲</span>
      </div>
    `,
      )
      .openPopup(); // پاپ‌آپ به صورت پیش‌فرض باز شود

    // بروزرسانی سایز نقشه
    setTimeout(() => {
      map.invalidateSize();
    }, 300);
  }

  onSubscribeNewsletter(event: Event): void {
    event.preventDefault();
    if (!this.newsletterEmail || !this.newsletterEmail.includes('@')) return;

    this.isSubscribed = true;
    this.newsletterEmail = '';

    setTimeout(() => {
      this.isSubscribed = false;
    }, 4000);
  }

  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }
}
