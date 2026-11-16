import mongoose, { Schema, Document, Model } from 'mongoose';
import { globalPlugin } from '../plugins/tenantPlugin';

export interface ICategory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  previousSlugs?: string[];
  description?: string;
  icon?: string;
  iconType?: 'material' | 'emoji' | 'google' | 'custom';
  customIconUrl?: string;
  /** 🎨 رنگ اصلی دسته‌بندی (hex) — برای آیکون و نشان در رابط کاربری */
  color?: string;
  image?: string;
  parent?: mongoose.Types.ObjectId | null;
  level: number; // 0 = root, 1 = subcategory
  order: number;
  isActive: boolean;
  totalCourses: number;
  metaTitle?: string;
  metaDescription?: string;
  createdAt: Date;
  updatedAt: Date;
  // Virtuals
  children?: ICategory[];
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'نام دسته‌بندی الزامی است'],
      trim: true,
      unique: true,
      maxlength: 60,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    previousSlugs: { type: [String], default: [] },
    description: { type: String, maxlength: 200 },
    icon: { type: String, default: '' },
    iconType: {
      type: String,
      enum: ['material', 'emoji', 'google', 'custom'],
      default: 'material',
    },
    customIconUrl: { type: String, default: '' },
    // 🎨 رنگ دسته‌بندی — اختیاری؛ اگر خالی باشد فقط آیکون/تصویر نمایش داده می‌شود
    color: {
      type: String,
      default: '',
      trim: true,
      validate: {
        validator: (value: string) => !value || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value),
        message: 'رنگ باید کد هگز معتبر باشد (مثال: #8b5cf6)',
      },
    },
    image: { type: String },
    parent: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    level: {
      type: Number,
      default: 0,
      min: 0,
      max: 2, // Maximum 2 levels: root -> subcategory
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    totalCourses: { type: Number, default: 0 },
    metaTitle: { type: String, maxlength: 60 },
    metaDescription: { type: String, maxlength: 200 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

categorySchema.index({ parent: 1, order: 1 });
categorySchema.index({ isActive: 1 });
categorySchema.index({ level: 1 });
categorySchema.index({ previousSlugs: 1 });

// Virtual: children
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

// Pre-save middleware to set level based on parent
categorySchema.pre('save', async function (next) {
  if (this.parent) {
    const parent = await Category.findById(this.parent);
    if (parent) {
      this.level = parent.level + 1;
    }
  } else {
    this.level = 0;
  }
  next();
});

// Apply global plugin (Category is global, not tenant-scoped)
categorySchema.plugin(globalPlugin);

const Category: Model<ICategory> = mongoose.model<ICategory>('Category', categorySchema);
export default Category;
