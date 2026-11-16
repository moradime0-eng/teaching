import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { generateSlug, generateUniqueSlug } from '../utils/slugGenerator';
import { CourseStatus } from '../types';
import { invalidateCache } from '../middlewares/cache';
import { uploadBufferToCloudinary } from '../middlewares/upload';

// Invalidate category cache helper
const invalidateCategoryCache = async () => {
  await invalidateCache([`cache:*categories*`, `cache:*courses*`]);
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isAdmin = (req: Request): boolean => req.user?.role === 'admin';


const sanitizeSlugInput = (slug: unknown, fallbackName: string): string => {
  const raw = typeof slug === 'string' ? slug.trim() : '';
  if (!raw) return generateSlug(fallbackName);
  return raw
    .replace(/[<>"'`\\/?#%&{}[\]|^~$*+=:;,!()@]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
};

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const {
    name,
    slug: rawSlug,
    description,
    parent,
    order,
    icon,
    iconType,
    customIconUrl,
    color,
    isActive,
    metaTitle,
    metaDescription,
  } = req.body;

  const trimmedName = String(name ?? '').trim();
  if (!trimmedName) {
    throw ApiError.badRequest('نام دسته‌بندی الزامی است');
  }

  const duplicateName = await Category.findOne({
    name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
  });
  if (duplicateName) {
    throw ApiError.conflict('دسته‌بندی با این نام قبلاً وجود داشته است');
  }

  const baseSlug = sanitizeSlugInput(rawSlug, trimmedName);
  const slug = await generateUniqueSlug(baseSlug || trimmedName, Category);

  let level = 0;
  if (parent) {
    const parentCategory = await Category.findById(parent);
    // 🛡️ والد نامعتبر نباید ذخیره شود — قبلاً level=0 می‌ماند و داده ناسازگار می‌شد
    if (!parentCategory) {
      throw ApiError.badRequest('دسته والد انتخاب‌شده معتبر نیست');
    }
    // 🛡️ حداکثر ۲ سطح: root (0) → subcategory (1)
    if (parentCategory.level >= 1) {
      throw ApiError.badRequest('امکان ساخت زیردسته برای زیردسته وجود ندارد (حداکثر ۲ سطح)');
    }
    level = parentCategory.level + 1;
  }

  const category = await Category.create({
    name: trimmedName,
    slug,
    description,
    parent: parent || null,
    level,
    order: order || 0,
    icon,
    iconType: iconType || 'material',
    customIconUrl: customIconUrl || '',
    color: color || '',
    isActive: isActive !== undefined ? isActive : true,
    metaTitle,
    metaDescription,
  });

  await invalidateCategoryCache();

  return ApiResponse.created(res, category, 'دسته‌بندی با موفقیت ایجاد شد');
});

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const { type, parentId, level, showAll } = req.query;

  const includeInactive = String(showAll) === 'true' && isAdmin(req);

  const query: Record<string, unknown> = {};
  if (!includeInactive) {
    query.isActive = true;
  }

  if (type === 'parents') {
    query.parent = null;
  } else if (parentId) {
    query.parent = parentId;
  }

  if (level !== undefined) {
    query.level = Number(level);
  }

  const categories = await Category.find(query)
    .sort({ order: 1, name: 1 })
    .populate('parent', 'name slug');

  return ApiResponse.success(res, categories);
});

export const getCategoryTree = asyncHandler(async (req: Request, res: Response) => {
  const showAll = String(req.query.showAll) === 'true' && isAdmin(req);

  const [rootCounts, subCounts, allCategories] = await Promise.all([
    Course.aggregate([
      { $match: { status: CourseStatus.PUBLISHED } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Course.aggregate([
      { $match: { status: CourseStatus.PUBLISHED, subCategory: { $exists: true, $ne: null } } },
      { $group: { _id: '$subCategory', count: { $sum: 1 } } },
    ]),
    Category.find(showAll ? {} : { isActive: true })
      .sort({ order: 1, name: 1 })
      .lean(),
  ]);

  const countMap = new Map<string, number>();
  // شمارش دوره‌های هر دسته ریشه
  rootCounts.forEach((item) => {
    if (item._id) countMap.set(item._id.toString(), item.count);
  });
  // شمارش دوره‌های هر زیردسته
  subCounts.forEach((item) => {
    if (item._id) countMap.set(item._id.toString(), item.count);
  });

  // 🌳 ساخت درخت در حافظه (به‌جای کوئری بازگشتی N+1)
  const nodeMap = new Map<string, any>();
  for (const cat of allCategories) {
    nodeMap.set(cat._id.toString(), {
      ...cat,
      totalCourses: countMap.get(cat._id.toString()) || 0,
      children: [] as any[],
    });
  }

  const roots: any[] = [];
  for (const cat of allCategories) {
    const node = nodeMap.get(cat._id.toString());
    const parentId = cat.parent ? cat.parent.toString() : null;
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  // حذف آرایه‌های خالی children برای پاسخ تمیزتر
  for (const node of nodeMap.values()) {
    if (node.children.length === 0) {
      delete node.children;
    }
  }

  // جلوگیری از ذخیره پاسخ در مرورگر هنگام درخواست ادمین
  if (showAll) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }

  return ApiResponse.success(res, roots);
});

export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const isObjectId = mongoose.Types.ObjectId.isValid(id);
  let category = isObjectId
    ? await Category.findById(id).populate('parent', 'name slug')
    : await Category.findOne({ slug: id }).populate('parent', 'name slug');

  if (!category && !isObjectId) {
    // 🔗 اسلاگ قدیمی → همان دسته (حفظ SEO)
    category = await Category.findOne({ previousSlugs: id }).populate('parent', 'name slug');
  }

  if (!category) {
    throw ApiError.notFound('دسته‌بندی یافت نشد');
  }

  if (!category.isActive && !isAdmin(req)) {
    throw ApiError.notFound('دسته‌بندی یافت نشد');
  }

  return ApiResponse.success(res, category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    slug: rawSlug,
    description,
    parent,
    order,
    icon,
    iconType,
    customIconUrl,
    color,
    isActive,
    metaTitle,
    metaDescription,
  } = req.body;

  const category = await Category.findById(id);
  if (!category) {
    throw ApiError.notFound('دسته‌بندی یافت نشد');
  }

  // ─── اعتبارسنجی والد ───
  if (parent !== undefined) {
    if (parent && parent === id) {
      throw ApiError.badRequest('دسته‌بندی نمی‌تواند والد خودش باشد');
    }

    if (parent) {
      const parentCategory = await Category.findById(parent);
      if (!parentCategory) {
        throw ApiError.badRequest('دسته والد انتخاب‌شده معتبر نیست');
      }
      // 🛡️ حداکثر ۲ سطح
      if (parentCategory.level >= 1) {
        throw ApiError.badRequest('امکان انتخاب زیردسته به عنوان والد وجود ندارد (حداکثر ۲ سطح)');
      }

      // 🛡️ جلوگیری از چرخه در ساختار والد/فرزند
      let currentParent: any = parentCategory;
      while (currentParent) {
        if (currentParent._id.toString() === id) {
          throw ApiError.badRequest('نمی‌توان یک زیرشاخه را به عنوان والد انتخاب کرد');
        }
        currentParent = currentParent.parent
          ? await Category.findById(currentParent.parent)
          : null;
      }

      const childCount = await Category.countDocuments({ parent: id });
      if (childCount > 0) {
        throw ApiError.badRequest(
          'این دسته‌بندی دارای زیردسته است و نمی‌تواند زیردسته شود. ابتدا زیردسته‌ها را جابه‌جا کنید.',
        );
      }
    }
  }

  // ─── تغییر نام ───
  if (name !== undefined) {
    const trimmedName = String(name).trim();
    if (!trimmedName) {
      throw ApiError.badRequest('نام دسته‌بندی الزامی است');
    }
    if (trimmedName !== category.name) {
      const duplicateName = await Category.findOne({
        _id: { $ne: id },
        name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
      });
      if (duplicateName) {
        throw ApiError.conflict('دسته‌بندی با این نام قبلاً وجود داشته است');
      }
      category.name = trimmedName;
    }
  }

  // ─── تغییر اسلاگ (صریح از کلاینت یا بازتولید از نام) ───
  const explicitSlug = typeof rawSlug === 'string' ? rawSlug.trim() : '';
  if (explicitSlug) {
    const cleanSlug = sanitizeSlugInput(explicitSlug, category.name);
    if (cleanSlug && cleanSlug !== category.slug) {
      const uniqueSlug = await generateUniqueSlug(cleanSlug, Category);
      if (uniqueSlug !== category.slug) {
        // 🔗 حفظ اسلاگ قبلی برای ریدایرکت ۳۰۱ (SEO)
        category.previousSlugs = Array.from(
          new Set([...(category.previousSlugs || []), category.slug]),
        );
        category.slug = uniqueSlug;
      }
    }
  } else if (name !== undefined && category.isModified('name')) {
    const newSlug = await generateUniqueSlug(category.name, Category);
    if (newSlug !== category.slug) {
      category.previousSlugs = Array.from(
        new Set([...(category.previousSlugs || []), category.slug]),
      );
      category.slug = newSlug;
    }
  }

  if (description !== undefined) category.description = description;
  if (parent !== undefined) {
    category.parent = parent || null;
    if (parent) {
      const parentCategory = await Category.findById(parent);
      // 🛡️ سطح همیشه با والد هم‌گام می‌شود
      category.level = parentCategory ? parentCategory.level + 1 : 0;
    } else {
      category.level = 0;
    }
  }
  if (order !== undefined) category.order = order;
  if (icon !== undefined) category.icon = icon;
  if (iconType !== undefined) category.iconType = iconType;
  if (customIconUrl !== undefined) category.customIconUrl = customIconUrl;
  // 🎨 رنگ اختیاری — ارسال رشتهٔ خالی رنگ را پاک می‌کند
  if (color !== undefined) category.color = color || '';
  if (isActive !== undefined) category.isActive = isActive;
  if (metaTitle !== undefined) category.metaTitle = metaTitle;
  if (metaDescription !== undefined) category.metaDescription = metaDescription;

  await category.save();

  await invalidateCategoryCache();

  return ApiResponse.success(res, category, 'دسته‌بندی با موفقیت بروزرسانی شد');
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const category = await Category.findById(id);
  if (!category) {
    throw ApiError.notFound('دسته‌بندی یافت نشد');
  }

  const childrenCount = await Category.countDocuments({ parent: id });
  if (childrenCount > 0) {
    throw ApiError.badRequest(
      'نمی‌توان دسته‌بندی دارای زیرشاخه را حذف کرد. ابتدا زیرشاخه‌ها را حذف کنید.',
    );
  }

  const courseCount = await Course.countDocuments({
    $or: [{ category: id }, { subCategory: id }],
  });
  if (courseCount > 0) {
    throw ApiError.badRequest(
      `این دسته‌بندی دارای ${courseCount} دوره است. ابتدا دوره‌ها را به دسته دیگری منتقل یا حذف کنید.`,
    );
  }

  await category.deleteOne();
  await invalidateCategoryCache();
  return ApiResponse.success(res, null, 'دسته‌بندی با موفقیت حذف شد');
});

export const toggleCategoryActive = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const category = await Category.findById(id);
  if (!category) {
    throw ApiError.notFound('دسته‌بندی یافت نشد');
  }

  category.isActive = !category.isActive;
  await category.save();

  // 💡 invalidate کش تا تغییر وضعیت بلافاصله در مگامنو و لیست دوره‌ها منعکس شود
  await invalidateCategoryCache();

  const msg = category.isActive ? 'دسته‌بندی فعال شد' : 'دسته‌بندی غیرفعال شد';
  return ApiResponse.success(res, category, msg);
});


export const uploadCategoryIcon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('فایل تصویر آپلود نشده است');
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    throw ApiError.badRequest('فرمت فایل مجاز نیست. فقط JPEG, PNG, GIF و WebP مجاز هستند');
  }

  if (req.file.size > 2 * 1024 * 1024) {
    throw ApiError.badRequest('حجم فایل نباید بیشتر از ۲ مگابایت باشد');
  }

  if (!req.file.buffer) {
    throw ApiError.badRequest('فایل تصویر آپلود نشده است');
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, 'category-icons', 'image');

  return ApiResponse.success(
    res,
    { url: result.url, customIconUrl: result.url },
    'آیکون با موفقیت آپلود شد',
  );
});
