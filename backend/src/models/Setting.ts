import mongoose, { Schema, Document } from 'mongoose';

/**
 * 📋 مدل تنظیمات سراسری سیستم (Singleton)
 *
 * فقط یک سند در این کلکسیون وجود دارد (با استفاده از _id ثابت)
 * تمام تنظیمات داینامیک سایت از اینجا خوانده می‌شوند
 */
export interface ISetting extends Document<string> {
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
  createdAt: Date;
  updatedAt: Date;
}

const settingSchema = new Schema<ISetting>(
  {
    _id: { type: String, required: true } as any, // Singleton: رشته ثابت به جای ObjectId
    siteName: {
      type: String,
      default: 'همایون',
      trim: true,
    },
    siteDescription: {
      type: String,
      default: 'مرکز تخصصی آموزش آنلاین',
      trim: true,
    },
    supportEmail: {
      type: String,
      default: '',
      trim: true,
    },
    supportPhone: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    workingHours: {
      type: String,
      default: 'شنبه تا پنجشنبه ۹:۰۰ تا ۱۸:۰۰',
      trim: true,
    },
    socialLinks: {
      instagram: { type: String, default: '' },
      telegram: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      twitter: { type: String, default: '' },
      youtube: { type: String, default: '' },
    },
    seo: {
      defaultMetaTitle: { type: String, default: 'همایون - مرکز تخصصی آموزش آنلاین' },
      defaultMetaDescription: {
        type: String,
        default: 'مرجع تخصصی آموزش برنامه‌نویسی، هوش مصنوعی و مهارت‌های دیجیتال',
      },
      defaultMetaKeywords: {
        type: [String],
        default: ['آموزش', 'برنامه‌نویسی', 'دوره آنلاین', 'همایون'],
      },
    },
    logo: { type: String, default: '' },
    favicon: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'settings',
  },
);

// Singleton pattern: فقط یک سند با این آیدی وجود دارد
const SINGLETON_ID = 'global_settings_singleton';

/**
 * متد کمکی برای دریافت تنظیمات (با cache در mongoose)
 */
settingSchema.statics.getSettings = async function (): Promise<ISetting> {
  let settings = await this.findById(SINGLETON_ID);
  if (!settings) {
    settings = await this.create({ _id: SINGLETON_ID });
  }
  return settings;
};

export interface SettingModel extends mongoose.Model<ISetting> {
  getSettings(): Promise<ISetting>;
}

const Setting = mongoose.model<ISetting, SettingModel>('Setting', settingSchema);
export default Setting;
