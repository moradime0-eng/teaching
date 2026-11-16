import { Request, Response } from 'express';
import Campaign from '../models/Campaign';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../middlewares/asyncHandler';
import { getPaginationOptions } from '../utils/paginationHelper';
import { invalidateCache } from '../middlewares/cache';
import { getActiveCampaign, clearCampaignCache } from '../services/campaign.service';
import mongoose from 'mongoose';

/**
 * 🎯 Campaign Controller
 *
 * Public endpoint: GET /active (returns active campaign + serverTime)
 * Admin CRUD: all under authenticate + adminOnly
 *
 * On create/update with isActive=true and overlapping date ranges,
 * atomically deactivate other active campaigns using a MongoDB transaction.
 */

// Helper to deactivate overlapping campaigns atomically
async function deactivateOverlappingCampaigns(
  session: mongoose.ClientSession,
  campaignId: mongoose.Types.ObjectId | null,
  startAt: Date,
  endAt: Date,
  tenantId?: mongoose.Types.ObjectId,
): Promise<void> {
  const filter: any = {
    isActive: true,
    $or: [
      { startAt: { $lt: endAt }, endAt: { $gt: startAt } }, // Overlapping date ranges
    ],
  };

  if (campaignId) {
    filter._id = { $ne: campaignId };
  }

  if (tenantId) {
    filter.tenant = tenantId;
  }

  await Campaign.updateMany(filter, { $set: { isActive: false } }, { session });
}

/**
 * GET /api/v1/campaigns/active
 * Public endpoint - returns the currently active campaign (if any) + serverTime
 * Cached via cacheMiddleware(30) in routes
 */
export const getActiveCampaignPublic = asyncHandler(async (req: Request, res: Response) => {
  const { campaign, serverTime } = await getActiveCampaign();

  // Return minimal public data
  const publicCampaign = campaign
    ? {
        _id: campaign._id,
        title: campaign.title,
        bannerText: campaign.bannerText,
        startAt: campaign.startAt,
        endAt: campaign.endAt,
        discountType: campaign.discountType,
        discountValue: campaign.discountValue,
        maxDiscount: campaign.maxDiscount,
        scope: campaign.scope,
        categories: campaign.categories,
        excludedCourses: campaign.excludedCourses,
        theme: campaign.theme,
        // 🎨 Custom colors (optional) — overrides the CSS theme when present
        colors: campaign.colors,
        isActive: campaign.isActive,
      }
    : null;

  return ApiResponse.success(res, { campaign: publicCampaign, serverTime });
});

/**
 * GET /api/v1/campaigns
 * Admin - list all campaigns with pagination
 */
export const listCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationOptions(req);

  const filter: any = {};
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }
  if (req.query.scope) {
    filter.scope = req.query.scope;
  }

  // Multi-tenancy: if enabled, filter by tenant
  const tenantId = (req as any).tenantId;
  if (tenantId) {
    filter.tenant = tenantId;
  }

  // ─── Status filter (active / scheduled / expired / inactive) ───
  const now = new Date();
  switch (req.query.status as string) {
    case 'active':
      filter.isActive = true;
      filter.startAt = { $lte: now };
      filter.endAt = { $gt: now };
      break;
    case 'scheduled':
      filter.isActive = true;
      filter.startAt = { $gt: now };
      break;
    case 'expired':
      filter.isActive = true;
      filter.endAt = { $lte: now };
      break;
    case 'inactive':
      filter.isActive = false;
      break;
    default:
      break;
  }

  // ─── Search filter (title / bannerText) ───
  const search = (req.query.search as string)?.trim();
  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: safe, $options: 'i' } },
      { bannerText: { $regex: safe, $options: 'i' } },
    ];
  }

  // ⚠️ FIX: whitelist sort fields — user input must not reach MongoDB directly
  const SORTABLE_FIELDS = ['createdAt', 'updatedAt', 'title', 'startAt', 'endAt'];
  const requestedSort = (req.query.sort as string) || 'createdAt';
  const sortField = SORTABLE_FIELDS.includes(requestedSort) ? requestedSort : 'createdAt';
  const sortOrder = req.query.order === 'asc' ? 1 : -1;
  const sort = { [sortField]: sortOrder } as Record<string, 1 | -1>;

  const [campaigns, total] = await Promise.all([
    Campaign.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'fullName email')
      .populate('categories', 'name slug')
      .lean(),
    Campaign.countDocuments(filter),
  ]);

  // ⚠️ FIX: argument order is (res, data, page, limit, total)
  return ApiResponse.paginated(res, campaigns, page, limit, total);
});

/**
 * GET /api/v1/campaigns/stats
 * Admin - status counters across ALL campaigns (not just the current page)
 */
export const getCampaignStats = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();

  const baseFilter: any = {};
  const tenantId = (req as any).tenantId;
  if (tenantId) {
    baseFilter.tenant = tenantId;
  }

  const [total, active, scheduled, expired, inactive] = await Promise.all([
    Campaign.countDocuments(baseFilter),
    Campaign.countDocuments({
      ...baseFilter,
      isActive: true,
      startAt: { $lte: now },
      endAt: { $gt: now },
    }),
    Campaign.countDocuments({ ...baseFilter, isActive: true, startAt: { $gt: now } }),
    Campaign.countDocuments({ ...baseFilter, isActive: true, endAt: { $lte: now } }),
    Campaign.countDocuments({ ...baseFilter, isActive: false }),
  ]);

  return ApiResponse.success(res, { total, active, scheduled, expired, inactive });
});

/**
 * GET /api/v1/campaigns/:id
 * Admin - get campaign by ID
 */
export const getCampaignById = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await Campaign.findById(req.params.id)
    .populate('createdBy', 'fullName email')
    .populate('categories', 'name slug')
    .populate('excludedCourses', 'title slug')
    .lean();

  if (!campaign) {
    throw ApiError.notFound('کمپین یافت نشد');
  }

  return ApiResponse.success(res, campaign);
});

/**
 * POST /api/v1/campaigns
 * Admin - create new campaign
 * Uses MongoDB transaction to atomically deactivate overlapping campaigns
 */
export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { isActive, startAt, endAt } = req.body;

    // If activating, deactivate overlapping campaigns
    if (isActive) {
      await deactivateOverlappingCampaigns(
        session,
        null,
        new Date(startAt),
        new Date(endAt),
        (req as any).tenantId,
      );
    }

    const campaign = await Campaign.create(
      [
        {
          ...req.body,
          createdBy: req.user._id,
          tenant: (req as any).tenantId,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    // Invalidate caches
    await invalidateCache([
      'cache:*campaigns*',
      'cache:*courses*',
      'cache:*search*',
      'cache:*home*',
    ]);
    await clearCampaignCache();

    return ApiResponse.created(res, campaign[0], 'کمپین با موفقیت ایجاد شد');
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

/**
 * PUT /api/v1/campaigns/:id
 * Admin - update campaign
 * Uses MongoDB transaction to atomically deactivate overlapping campaigns if dates/isActive changed
 */
export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await Campaign.findById(req.params.id).session(session);
    if (!existing) {
      throw ApiError.notFound('کمپین یافت نشد');
    }

    const { isActive, startAt, endAt } = req.body;
    const newIsActive = isActive !== undefined ? isActive : existing.isActive;
    const newStartAt = startAt ? new Date(startAt) : existing.startAt;
    const newEndAt = endAt ? new Date(endAt) : existing.endAt;

    // If activating or changing dates while active, deactivate overlapping campaigns
    if (newIsActive && (isActive !== undefined || startAt || endAt)) {
      await deactivateOverlappingCampaigns(
        session,
        existing._id,
        newStartAt,
        newEndAt,
        (req as any).tenantId,
      );
    }

    const campaign = await Campaign.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true, session },
    ).populate('createdBy', 'fullName email');

    await session.commitTransaction();

    // Invalidate caches
    await invalidateCache([
      'cache:*campaigns*',
      'cache:*courses*',
      'cache:*search*',
      'cache:*home*',
    ]);
    await clearCampaignCache();

    return ApiResponse.success(res, campaign, 'کمپین با موفقیت به‌روزرسانی شد');
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

/**
 * DELETE /api/v1/campaigns/:id
 * Admin - delete campaign
 */
export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();

  const campaign = await Campaign.findByIdAndDelete(req.params.id);
  if (!campaign) {
    throw ApiError.notFound('کمپین یافت نشد');
  }

  // Invalidate caches
  await invalidateCache(['cache:*campaigns*', 'cache:*courses*', 'cache:*search*', 'cache:*home*']);
  await clearCampaignCache();

  return ApiResponse.success(res, null, 'کمپین با موفقیت حذف شد');
});
