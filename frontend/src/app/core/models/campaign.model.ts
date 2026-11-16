export type CampaignTheme = 'fire' | 'cold' | 'gold' | 'green';

/**
 * 🎨 Custom banner colors.
 * When present, these override the built-in CSS theme.
 * - `background`: solid hex color (used when `gradient` is empty)
 * - `gradient`: 2–4 hex colors → the banner renders a gradient
 * - `gradientAngle`: gradient angle in degrees (0–360)
 */
export interface CampaignColors {
  background?: string;
  gradient?: string[];
  gradientAngle?: number;
}

export interface Campaign {
  _id: string;
  title: string;
  bannerText: string;
  startAt: string;
  endAt: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  scope: 'all' | 'categories';
  categories?: string[];
  excludedCourses?: string[];
  theme: CampaignTheme;
  /** 🎨 Custom banner colors (optional) */
  colors?: CampaignColors;
  isActive: boolean;
}

export interface ActiveCampaignResponse {
  campaign: Campaign | null;
  serverTime: number;
}