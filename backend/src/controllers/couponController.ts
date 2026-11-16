import { Request, Response } from 'express';
import Coupon from '../models/Coupon';
import Cart from '../models/Cart';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { validateCouponScope } from '../services/coupon.service';

/**
 * ⚠️ FIX SECURITY: ویلست فیلدهای مجاز کوپون.
 * پیش از این `...req.body` مستقیماً در create/update پخش می‌شد، بنابراین
 * با ارسال usedCount / usedBy / createdBy می‌شد سقف مصرف و سابقه را جعل کرد.
 */
const COUPON_WRITABLE_FIELDS = [
  'code',
  'description',
  'discountType',
  'discountValue',
  'maxDiscount',
  'minPurchase',
  'applicableCourses',
  'applicableCategories',
  'excludedCourses',
  'usageLimit',
  'usageLimitPerUser',
  'validFrom',
  'validUntil',
  'isActive',
  'isFirstPurchaseOnly',
] as const;

function pickCouponFields(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of COUPON_WRITABLE_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

export const createCoupon = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  if (!req.body.code) throw ApiError.badRequest('کد تخفیف الزامی است');

  const existing = await Coupon.findOne({ code: req.body.code.toUpperCase() });
  if (existing) {
    throw ApiError.conflict('کد تخفیف با این نام قبلاً وجود دارد');
  }

  const coupon = await Coupon.create({
    ...pickCouponFields(req.body),
    code: req.body.code.toUpperCase(),
    createdBy: req.user._id,
  });

  return ApiResponse.created(res, coupon, 'کد تخفیف با موفقیت ایجاد شد');
});

export const getAllCoupons = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationOptions(req);
  const filter: Record<string, any> = {};

  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  const coupons = await Coupon.find(filter)
    .populate('createdBy', 'fullName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Coupon.countDocuments(filter);

  return ApiResponse.paginated(res, coupons, page, limit, total);
});

export const getCouponById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const coupon = await Coupon.findById(id).populate('createdBy', 'fullName email');
  if (!coupon) throw ApiError.notFound('کد تخفیف یافت نشد');

  return ApiResponse.success(res, coupon);
});

export const updateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // ⚠️ FIX SECURITY: به‌جای `$set: req.body` از ویلست فیلدها استفاده می‌شود
  const updates = pickCouponFields(req.body);

  if (updates.code) {
    updates.code = updates.code.toUpperCase();
  }

  const coupon = await Coupon.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  );
  if (!coupon) throw ApiError.notFound('کد تخفیف یافت نشد');

  return ApiResponse.success(res, coupon, 'کد تخفیف با موفقیت بروزرسانی شد');
});

export const deleteCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) throw ApiError.notFound('کد تخفیف یافت نشد');

  return ApiResponse.success(res, null, 'کد تخفیف با موفقیت حذف شد');
});

export const validateCoupon = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!req.user) throw ApiError.unauthorized();

  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isActive: true,
    validFrom: { $lte: new Date() },
    validUntil: { $gte: new Date() },
  });

  if (!coupon) {
    throw ApiError.badRequest('کد تخفیف نامعتبر یا منقضی شده است');
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('ظرفیت استفاده از این کد تکمیل شده است');
  }

  const userUsage = coupon.usedBy.filter(
    (u) => u.user.toString() === req.user!._id.toString(),
  ).length;
  if (userUsage >= coupon.usageLimitPerUser) {
    throw ApiError.badRequest('شما قبلاً از این کد استفاده کرده‌اید');
  }

  // ⚠️ FIX M1: بررسی دامنه‌ی کوپن با «سبد خرید فعلی» کاربر — تا فرانت قبل از
  // پرداخت خطای دامنه را بگیرد (پیش‌تر فقط زمان/سقف مصرف چک می‌شد)
  const cart = await Cart.findOne({ user: req.user._id }).populate(
    'items.course',
    'category',
  );
  const cartItems = (cart?.items ?? []) as any[];
  const courseIds = cartItems
    .map((it) =>
      typeof it.course === 'object' && it.course?._id
        ? it.course._id.toString()
        : it.course?.toString(),
    )
    .filter((v): v is string => !!v);
  const categoryIds = [
    ...new Set(
      cartItems
        .map((it) =>
          typeof it.course === 'object' ? it.course?.category?.toString() : undefined,
        )
        .filter((v): v is string => !!v),
    ),
  ];

  const scopeCheck = await validateCouponScope(
    coupon,
    courseIds,
    categoryIds,
    req.user!._id.toString(),
  );
  if (!scopeCheck.valid) {
    throw ApiError.badRequest(
      scopeCheck.reason || 'کد تخفیف برای سبد خرید شما قابل استفاده نیست',
    );
  }

  // ⚠️ FIX C + L4: محاسبه‌ی مبلغ واقعی تخفیف + قیمت نهایی سبد + چک minPurchase
  // (قبلاً validateCoupon نه تخفیف محاسبه‌شده را برمی‌گرداند و نه minPurchase
  //  را چک می‌کرد → فرانت تخفیفی نشان می‌داد که سرور موقع پرداخت رد می‌کرد)
  const totalPrice = cart?.totalPrice ?? 0;
  let calculatedDiscount = 0;
  if ((cart?.items?.length ?? 0) > 0) {
    if (coupon.minPurchase && totalPrice < coupon.minPurchase) {
      throw ApiError.badRequest(
        `حداقل مبلغ خرید برای این کد تخفیف ${coupon.minPurchase.toLocaleString('fa-IR')} تومان است`,
      );
    }
    if (coupon.discountType === 'percentage') {
      calculatedDiscount = Math.round((totalPrice * coupon.discountValue) / 100);
      if (coupon.maxDiscount && calculatedDiscount > coupon.maxDiscount) {
        calculatedDiscount = coupon.maxDiscount;
      }
    } else {
      calculatedDiscount = Math.min(coupon.discountValue, totalPrice);
    }
    // تخفیف هرگز از کل سبد بیشتر نمی‌شود
    calculatedDiscount = Math.min(calculatedDiscount, totalPrice);
  }

  return ApiResponse.success(
    res,
    {
      // فیلدهای تخت + valid: سازگاری عقب‌رو — checkout فعلی از data.discountType می‌خواند؛
      // ساختار تو در تو (coupon: {...}) الگوی فرانتِ موجود را می‌شکست
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount,
      minPurchase: coupon.minPurchase,
      // ⚠️ FIX C: مبلغ تخفیف واقعیِ سبد + قیمت نهایی
      calculatedDiscount,
      finalPrice: Math.max(0, totalPrice - calculatedDiscount),
    },
    'کد تخفیف معتبر است',
  );
});
