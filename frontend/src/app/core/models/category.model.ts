export interface Category {
  _id: string;
  name: string;
  slug: string;
  previousSlugs?: string[];
  description?: string;
  icon?: string;
  iconType?: 'material' | 'emoji' | 'google' | 'custom';
  customIconUrl?: string;
  /** 🎨 رنگ اصلی دسته‌بندی (hex) */
  color?: string;
  image?: string;
  parent?: string | null;
  level: number; // 0 = root, 1 = subcategory
  order: number;
  isActive: boolean;
  totalCourses: number;
  metaTitle?: string;
  metaDescription?: string;
  children?: Category[];
  createdAt: string;
  updatedAt: string;
}