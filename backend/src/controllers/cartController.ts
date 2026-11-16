import { Request, Response } from 'express';
import Cart from '../models/Cart';
import Course from '../models/Course';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { calculateCoursePricing } from '../services/pricing.service';
import { getActiveCampaign } from '../services/campaign.service';

/**
 * 🧮 محاسبه مجدد سبد خرید
 * قیمت هر آیتم روی فیلد `priceAtAdd` (قیمت لحظه افزودن به سبد) قفل می‌شود
 * تا با گذشت زمان و تغییر تخفیف معکوس، قیمت در سبد خرید گران‌تر نشود.
 * Campaign discount is applied as a separate time-checked layer at payment time (D3).
 */
const recalculateCart = async (cart: any) => {
  // Fetch active campaign once
  const { campaign: activeCampaign } = await getActiveCampaign();

  let totalPrice = 0;
  let totalDiscountedPrice = 0;

  for (const item of cart.items) {
    if (!item.course) continue;

    // اگر دوره populate نشده بود، آن را از دیتابیس بگیرید
    const course =
      typeof item.course === 'object' && item.course._id
        ? item.course
        : await Course.findById(item.course);

    if (course) {
      const livePricing = calculateCoursePricing(course, new Date(), activeCampaign);

      // 🎯 اگر قیمت زمان افزودن (priceAtAdd) وجود داشت، آن را قفل کن؛ در غیر این صورت قیمت زنده سرور
      // priceAtAdd locks the COURSE'S OWN price (D3), not the campaign price
      const lockedPrice =
        item.priceAtAdd !== undefined && item.priceAtAdd !== null
          ? item.priceAtAdd
          : livePricing.currentPrice;

      // محاسبه درصد تخفیف قفل‌شده بر اساس قیمت اصلی دوره
      const originalPrice = course.price || 0;
      const lockedDiscountPercent =
        originalPrice > 0
          ? Math.max(0, Math.round(((originalPrice - lockedPrice) / originalPrice) * 100))
          : 0;

      // ذخیره اطلاعات قیمت قفل‌شده روی شیء دوره جهت ارسال به فرانت‌اند
      if (typeof item.course === 'object') {
        item.course.pricing = {
          ...livePricing,
          currentPrice: lockedPrice,
          currentDiscountPercent: lockedDiscountPercent,
          discountActive: lockedDiscountPercent > 0,
        };
        item.course.currentPrice = lockedPrice;
        item.course.discountPercentage = lockedDiscountPercent;
      }

      totalPrice += lockedPrice;
      totalDiscountedPrice += lockedPrice;
    }
  }

  cart.totalPrice = totalPrice;

  // مبلغ نهایی با کسر تخفیف کد کوپن و تخفیف‌های قفل‌شده دوره
  const couponDiscount = cart.discountAmount || 0;
  cart.finalPrice = Math.max(0, totalDiscountedPrice - couponDiscount);

  await cart.save();
};

// ==================== GET CART ====================
export const getCart = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  let cart = await Cart.findOne({ user: req.user._id }).populate(
    'items.course',
    'title slug thumbnail price discountPrice discountType countdownDiscount discountEndsAt isFree',
  );

  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: [],
    });
  } else {
    // ⭐ محاسبه مجدد سبد خرید با حفظ و قفل‌سازی قیمت‌های لحظه افزودن (priceAtAdd)
    await recalculateCart(cart);
  }

  const cartObj = cart.toObject() as any;

  // اطمینان از تنظیم قیمت‌های قفل‌شده در خروجی JSON
  if (cartObj.items) {
    // Fetch active campaign for display
    const { campaign: activeCampaign } = await getActiveCampaign();
    cartObj.items.forEach((item: any) => {
      if (item.course) {
        const livePricing = calculateCoursePricing(item.course, new Date(), activeCampaign);
        const lockedPrice =
          item.priceAtAdd !== undefined && item.priceAtAdd !== null
            ? item.priceAtAdd
            : livePricing.currentPrice;

        const originalPrice = item.course.price || 0;
        const lockedDiscountPercent =
          originalPrice > 0
            ? Math.max(0, Math.round(((originalPrice - lockedPrice) / originalPrice) * 100))
            : 0;

        item.course.pricing = {
          ...livePricing,
          currentPrice: lockedPrice,
          currentDiscountPercent: lockedDiscountPercent,
          discountActive: lockedDiscountPercent > 0,
        };
        item.course.currentPrice = lockedPrice;
        item.course.discountPercentage = lockedDiscountPercent;
      }
    });
  }

  return ApiResponse.success(res, cartObj);
});

// ==================== ADD TO CART ====================
export const addToCart = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.body;
  if (!req.user) throw ApiError.unauthorized();

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('دوره یافت نشد');

  let cart = await Cart.findOne({ user: req.user._id });
  if (!cart) {
    cart = await Cart.create({
      user: req.user._id,
      items: [],
    });
  }

  const alreadyInCart = cart.items.some((item) => item.course.toString() === courseId);
  if (alreadyInCart) {
    throw ApiError.badRequest('این دوره قبلاً در سبد خرید شما اضافه شده است');
  }

  // 🔒 محاسبه دقیق قیمت لحظه‌ای که کاربر دکمه را می‌زند
  const { campaign: activeCampaign } = await getActiveCampaign();
  const livePricing = calculateCoursePricing(course, new Date(), activeCampaign);

  // 🔒 ثبت و قفل کردن قیمت در فیلد priceAtAdd
  // priceAtAdd locks the COURSE'S OWN price (D3), not the campaign price
  cart.items.push({
    course: courseId,
    priceAtAdd: livePricing.currentPrice,
    addedAt: new Date(),
  });

  await recalculateCart(cart);

  // دریافت سبد به‌روزرسانی‌شده با populate کامل
  const updatedCart = await Cart.findOne({ user: req.user._id }).populate(
    'items.course',
    'title slug thumbnail price discountPrice discountType countdownDiscount discountEndsAt isFree',
  );

  let cartObj = updatedCart ? updatedCart.toObject() as any : cart.toObject() as any;

  if (cartObj.items) {
    // Fetch active campaign for display
    const { campaign: displayCampaign } = await getActiveCampaign();
    cartObj.items.forEach((item: any) => {
      if (item.course) {
        const pricing = calculateCoursePricing(item.course, new Date(), displayCampaign);
        const lockedPrice =
          item.priceAtAdd !== undefined && item.priceAtAdd !== null
            ? item.priceAtAdd
            : pricing.currentPrice;

        const originalPrice = item.course.price || 0;
        const lockedDiscountPercent =
          originalPrice > 0
            ? Math.max(0, Math.round(((originalPrice - lockedPrice) / originalPrice) * 100))
            : 0;

        item.course.pricing = {
          ...pricing,
          currentPrice: lockedPrice,
          currentDiscountPercent: lockedDiscountPercent,
          discountActive: lockedDiscountPercent > 0,
        };
        item.course.currentPrice = lockedPrice;
        item.course.discountPercentage = lockedDiscountPercent;
      }
    });
  }

  return ApiResponse.success(res, cartObj, 'دوره به سبد خرید اضافه شد');
});

// ==================== REMOVE FROM CART ====================
export const removeFromCart = asyncHandler(async (req: Request, res: Response) => {
  const { courseId } = req.params;
  if (!req.user) throw ApiError.unauthorized();

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw ApiError.notFound('سبد خرید یافت نشد');

  cart.items = cart.items.filter((item) => item.course.toString() !== courseId);

  await recalculateCart(cart);

  const updatedCart = await Cart.findOne({ user: req.user._id }).populate(
    'items.course',
    'title slug thumbnail price discountPrice discountType countdownDiscount discountEndsAt isFree',
  );

  const cartObj = updatedCart ? (updatedCart.toObject() as any) : (cart.toObject() as any);

  if (cartObj.items) {
    cartObj.items.forEach((item: any) => {
      if (item.course) {
        const livePricing = calculateCoursePricing(item.course);
        const lockedPrice =
          item.priceAtAdd !== undefined && item.priceAtAdd !== null
            ? item.priceAtAdd
            : livePricing.currentPrice;

        const originalPrice = item.course.price || 0;
        const lockedDiscountPercent =
          originalPrice > 0
            ? Math.max(0, Math.round(((originalPrice - lockedPrice) / originalPrice) * 100))
            : 0;

        item.course.pricing = {
          ...livePricing,
          currentPrice: lockedPrice,
          currentDiscountPercent: lockedDiscountPercent,
          discountActive: lockedDiscountPercent > 0,
        };
        item.course.currentPrice = lockedPrice;
        item.course.discountPercentage = lockedDiscountPercent;
      }
    });
  }

  return ApiResponse.success(res, cartObj, 'دوره از سبد خرید حذف شد');
});