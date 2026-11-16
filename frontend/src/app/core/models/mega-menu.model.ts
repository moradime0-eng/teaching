/**
 * 🏷️ مدل‌های داده مگا منوی دسته‌بندی سه‌سطحی
 * ============================================================
 * ساختار سه‌لایه‌ای دسته‌بندی‌های آموزشی
 * ============================================================
 */

export interface MegaCategory {
  _id: string;
  name: string;
  slug: string;
  icon: string;
  iconType?: 'material' | 'emoji' | 'google' | 'custom';
  customIconUrl?: string;
  color: string;
  gradient: string;
  courseCount: number;
  studentsCount?: number;
  description?: string;
  isTrending?: boolean;
  isNew?: boolean;
  isFeatured?: boolean;
  subcategories: MegaSubCategory[];
}

export interface MegaSubCategory {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  iconType?: 'material' | 'emoji' | 'google' | 'custom';
  customIconUrl?: string;
  courseCount: number;
  isPopular?: boolean;
  topics: MegaTopic[];
}

export interface MegaTopic {
  _id: string;
  name: string;
  slug: string;
  courseCount: number;
  logo?: string;
  isHot?: boolean;
}

export interface RecentCategory {
  _id: string;
  name: string;
  slug: string;
  icon: string;
  gradient?: string;
  visitedAt: number;
}

export interface FeaturedCourse {
  _id: string;
  title: string;
  slug: string;
  thumbnail: string;
  price: number;
  discountPrice?: number;
  rating: number;
  studentsCount: number;
  instructor: string;
  categorySlug: string;
}