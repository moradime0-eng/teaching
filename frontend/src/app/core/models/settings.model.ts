/**
 * 🏷️ مدل تنظیمات سراسری سایت
 * 
 * از API GET /api/v1/settings دریافت می‌شود
 */
export interface SiteSettings {
  _id: string;
  siteName: string;
  siteDescription: string;
  supportEmail: string;
  supportPhone: string;
  address: string;
  workingHours: string;
  socialLinks: {
    instagram: string;
    telegram: string;
    linkedin: string;
    twitter: string;
    youtube: string;
  };
  seo: {
    defaultMetaTitle: string;
    defaultMetaDescription: string;
    defaultMetaKeywords: string[];
  };
  logo?: string;
  favicon?: string;
  isActive: boolean;
}