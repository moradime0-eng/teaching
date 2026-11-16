import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITenant extends Document {
  _id: mongoose.Types.ObjectId;
  name: string; // نام آموزشگاه (مثلاً: آکادمی آلفا)
  subdomain: string; // ساب‌دامین (مثلاً: alfa)
  customDomain?: string;
  logo?: string;
  favicon?: string;
  isActive: boolean;
  isDefault: boolean; // آیا تننت پیش‌فرض سیستم است
  // تنظیمات ظاهری اختصاصی تننت
  branding: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };

  // تنظیمات درگاه پرداخت اختصاصی آموزشگاه
  paymentSettings: {
    zarinpalMerchantId?: string;
    sandbox: boolean;
  };

  owner: mongoose.Types.ObjectId; // مدیر اصلی این آموزشگاه
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'ساب‌دامین فقط شامل حروف کوچک، اعداد و خط تیره می‌باشد'],
    },
    customDomain: { type: String, sparse: true, unique: true, lowercase: true, trim: true },
    logo: { type: String },
    favicon: { type: String },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    branding: {
      primaryColor: { type: String, default: '#a435f0' },
      secondaryColor: { type: String, default: '#1c1d1f' },
      fontFamily: { type: String, default: 'Vazirmatn' },
    },
    paymentSettings: {
      zarinpalMerchantId: { type: String },
      sandbox: { type: Boolean, default: true },
    },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const Tenant: Model<ITenant> = mongoose.model<ITenant>('Tenant', tenantSchema);
export default Tenant;
