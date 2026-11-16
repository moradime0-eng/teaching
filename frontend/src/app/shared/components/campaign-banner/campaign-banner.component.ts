import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CampaignService } from '../../../core/services/campaign.service';
import { buildBannerStyle } from '../../../core/utils/color.utils';
import { distinctBannerMessage } from '../../../core/utils/campaign-text.utils';
@Component({
  selector: 'app-campaign-banner',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './campaign-banner.component.html',
  styleUrl: './campaign-banner.component.scss',
})
export class CampaignBannerComponent implements OnInit, OnDestroy {
  protected campaignService = inject(CampaignService);
  private platformId = inject(PLATFORM_ID);

  /** Countdown timer signal */
  countdown = signal<string>('00:00:00:00');
  private countdownInterval: any = null;

  /**
   * ⚠️ FIX: متن پیام بنر فقط وقتی نمایش داده می‌شود که با عنوان کمپین فرق دارد.
   * بدون این بررسی، عنوان «کمپین جدید» دو بار پشت‌سرهم نمایش داده می‌شد.
   */
  readonly distinctMessage = computed(() => {
    const campaign = this.campaignService.activeCampaign();
    return distinctBannerMessage(campaign?.title, campaign?.bannerText);
  });

  /** Theme-specific icon */
  readonly themeIcon = computed(() => {
    const campaign = this.campaignService.activeCampaign();
    if (!campaign) return 'local_fire_department';
    switch (campaign.theme) {
      case 'fire':
        return 'local_fire_department';
      case 'cold':
        return 'ac_unit';
      case 'gold':
        return 'workspace_premium';
      case 'green':
        return 'eco';
      default:
        return 'local_fire_department';
    }
  });

  /** Theme-specific CSS class */
  readonly themeClass = computed(() => {
    const campaign = this.campaignService.activeCampaign();
    return campaign ? `theme-${campaign.theme}` : 'theme-fire';
  });

  /**
   * 🎨 Inline style built from the admin's custom colors.
   * When present, it overrides the built-in CSS theme variables.
   */
  readonly customStyle = computed(() => {
    const campaign = this.campaignService.activeCampaign();
    return buildBannerStyle(campaign?.colors);
  });

  ngOnInit(): void {
    // ⚠️ FIX: بارگذاری کمپین در AppComponent انجام می‌شود (تا شرط نمایش بنر
    // بتواند activeCampaign را ببیند). اینجا فقط اگر هنوز چیزی بارگذاری نشده
    // یک‌بار درخواست می‌دهیم.
    if (isPlatformBrowser(this.platformId) && !this.campaignService.activeCampaign()) {
      this.campaignService.loadActiveCampaign().subscribe();
    }

    // Start countdown timer
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  private startCountdown(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Initial update
    this.updateCountdown();

    // Update every second
    this.countdownInterval = setInterval(() => {
      this.updateCountdown();
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private updateCountdown(): void {
    const remaining = this.campaignService.remainingTime();
    if (remaining <= 0) {
      this.countdown.set('00:00:00:00');
      this.stopCountdown();
      return;
    }

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

    this.countdown.set(
      `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
    );
  }

  /** Dismiss the banner (saves to localStorage) */
  dismiss(): void {
    const campaign = this.campaignService.activeCampaign();
    if (campaign) {
      this.campaignService.dismiss(campaign._id);
    }
  }
}
