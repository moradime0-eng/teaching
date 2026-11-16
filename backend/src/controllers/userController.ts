import { Request, Response } from 'express';
import User from '../models/User';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { sanitizeUser } from '../utils/helpers';
import Membership from '../models/Membership';
import path from 'path';
import fs from 'fs';
import {
  uploadBufferToCloudinary,
  deleteFromCloudinaryByUrl,
} from '../middlewares/upload';
import {
  uploadToCloudinary,
  getTenantFolder,
} from '../config/cloudinary';

/**
 * حذف آواتار قدیمی و آپلود آواتار جدید به Cloudinary
 * تابع کمکی برای جلوگیری از تکرار کد در uploadAvatar و updateProfile
 */
const processAvatarUpload = async (
  file: Express.Multer.File,
  currentAvatar?: string,
): Promise<string> => {
  // حذف آواتار قدیمی (Cloudinary یا لوکال)
  if (currentAvatar) {
    if (currentAvatar.includes('cloudinary.com')) {
      await deleteFromCloudinaryByUrl(currentAvatar, 'image');
    } else if (currentAvatar.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, '..', '..', currentAvatar);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (err) {
          console.warn('Failed to delete old avatar file:', oldPath, err);
        }
      }
    }
  }

  // آپلود آواتار جدید به Cloudinary
  const folder = getTenantFolder('avatars');

  if (file.buffer) {
    const result = await uploadBufferToCloudinary(file.buffer, folder, 'image');
    return result.url;
  } else if (file.path) {
    try {
      const result = await uploadToCloudinary(file.path, 'avatars', 'image');
      return result.url;
    } finally {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn('Failed to delete temp avatar file:', file.path, err);
      }
    }
  }

  throw new ApiError(400, 'فایل تصویر آپلود نشده است');
};

// ✅ کنترلر آپلود آواتار
export const uploadAvatar = asyncHandler(async (req: any, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'لطفاً یک فایل تصویر انتخاب کنید.');
  }

  const userId = req.user?._id || req.user?.id;
  if (!userId) {
    throw ApiError.unauthorized();
  }

  const user = await User.findById(userId);
  const avatarUrl = await processAvatarUpload(req.file, user?.avatar);

  // ذخیره در دیتابیس
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { avatar: avatarUrl },
    { new: true },
  ).select('-password');

  return ApiResponse.success(
    res,
    {
      avatar: avatarUrl,
      user: updatedUser,
    },
    'تصویر پروفایل با موفقیت بروزرسانی شد.',
  );
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  return ApiResponse.success(res, sanitizeUser(req.user));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const allowedUpdates = ['fullName', 'phone', 'bio', 'avatar', 'preferredLanguage', 'timezone'];
  const updates: Record<string, any> = {};

  Object.keys(req.body).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      updates[key] = req.body[key];
    }
  });

  // اگر فایل آواتار آپلود شده، آن را به Cloudinary آپلود کن
  if (req.file) {
    updates.avatar = await processAvatarUpload(req.file, req.user.avatar);
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updates },
    { new: true, runValidators: true },
  );

  return ApiResponse.success(res, sanitizeUser(updatedUser), 'پروفایل با موفقیت بروزرسانی شد');
});

export const updateInstructorProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const { headline, biography, website, socialLinks, expertise } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  user.instructorProfile = {
    ...user.instructorProfile,
    headline: headline ?? user.instructorProfile?.headline,
    biography: biography ?? user.instructorProfile?.biography,
    website: website ?? user.instructorProfile?.website,
    socialLinks: {
      ...user.instructorProfile?.socialLinks,
      ...socialLinks,
    },
    expertise: expertise ?? user.instructorProfile?.expertise,
    totalStudents: user.instructorProfile?.totalStudents ?? 0,
    totalCourses: user.instructorProfile?.totalCourses ?? 0,
    totalReviews: user.instructorProfile?.totalReviews ?? 0,
    averageRating: user.instructorProfile?.averageRating ?? 0,
    totalEarnings: user.instructorProfile?.totalEarnings ?? 0,
    isApproved: user.instructorProfile?.isApproved ?? false,
  };

  await user.save();
  return ApiResponse.success(res, sanitizeUser(user), 'پروفایل مدرس با موفقیت بروزرسانی شد');
});

// Admin Controllers
export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip, sort } = getPaginationOptions(req);
  const filter: Record<string, any> = {};

  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive) filter.isActive = req.query.isActive === 'true';
  if (req.query.search) {
    filter.fullName = { $regex: req.query.search, $options: 'i' };
  }

  const users = await User.find(filter).sort(sort).skip(skip).limit(limit);
  const total = await User.countDocuments(filter);

  return ApiResponse.paginated(res, users.map(sanitizeUser), page, limit, total);
});

export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  user.isBanned = true;
  user.banReason = reason || 'نقض قوانین پلتفرم';
  user.refreshTokens = []; // Log out from all devices
  await user.save();

  return ApiResponse.success(res, sanitizeUser(user), 'کاربر با موفقیت مسدود شد');
});

export const getUserMemberships = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  // پیدا کردن تمام عضویت‌های کاربر جاری در تننت‌های مختلف به همراه اطلاعات آموزشگاه
  const memberships = await Membership.find({ user: req.user._id })
    .populate('tenant', 'name subdomain logo branding')
    .sort({ createdAt: -1 });

  return ApiResponse.success(res, memberships);
});

export const unbanUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('کاربر یافت نشد');

  user.isBanned = false;
  user.banReason = undefined;
  await user.save();

  return ApiResponse.success(res, sanitizeUser(user), 'کاربر با موفقیت رفع مسدودیت شد');
});
