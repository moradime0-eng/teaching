import Campaign from '../models/Campaign';
import redis from '../config/redis';
import { getCurrentTenantId } from '../utils/tenantContext';

/**
 * 🎯 Campaign Service
 *
 * Handles active campaign lookup with dual-layer caching:
 * - Redis cache (TTL 30s) for cross-process consistency
 * - In-process memory cache (TTL 15s) for synchronous pricing path speed
 *
 * The synchronous pricing function (calculateCoursePricing) cannot await,
 * so we keep a hot in-memory copy that's refreshed from Redis.
 */

// In-process memory cache
let memoryCache: {
  campaign: any | null;
  expiresAt: number;
} = { campaign: null, expiresAt: 0 };

const MEMORY_TTL_MS = 15_000; // 15 seconds
const REDIS_TTL_SECONDS = 30; // 30 seconds

function getRedisCacheKey(): string {
  const tenantId = getCurrentTenantId() || 'global';
  return `cache:${tenantId}:active_campaign`;
}

function isMemoryCacheValid(): boolean {
  return memoryCache.campaign !== null && Date.now() < memoryCache.expiresAt;
}

function setMemoryCache(campaign: any | null): void {
  memoryCache = {
    campaign,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  };
}

function clearMemoryCache(): void {
  memoryCache = { campaign: null, expiresAt: 0 };
}

/**
 * Get the currently active campaign (if any).
 * Returns the campaign document + serverTime for countdown offset.
 * Uses Redis + in-process cache for speed.
 */
export async function getActiveCampaign(now: Date = new Date()): Promise<{
  campaign: any | null;
  serverTime: number;
}> {
  // 1. Check in-process memory cache first (fastest)
  if (isMemoryCacheValid()) {
    const cached = memoryCache.campaign;
    if (
      cached &&
      cached.isActive &&
      new Date(cached.startAt) <= now &&
      new Date(cached.endAt) > now
    ) {
      return { campaign: cached, serverTime: now.getTime() };
    }
    // Cached campaign expired or not active anymore
    clearMemoryCache();
  }

  // 2. Check Redis cache
  const redisKey = getRedisCacheKey();
  if (redis.isConnected && redis.client) {
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Validate the cached campaign is still active
        if (parsed.isActive && new Date(parsed.startAt) <= now && new Date(parsed.endAt) > now) {
          setMemoryCache(parsed);
          return { campaign: parsed, serverTime: now.getTime() };
        }
      }
    } catch {
      // Redis error - fall through to DB
    }
  }

  // 3. Query database
  const campaign = await Campaign.findOne({
    isActive: true,
    startAt: { $lte: now },
    endAt: { $gt: now },
  })
    .select(
      'title bannerText startAt endAt discountType discountValue maxDiscount scope categories excludedCourses theme colors isActive createdBy tenant',
    )
    .lean();

  // 4. Update caches
  if (campaign) {
    const plain = JSON.parse(JSON.stringify(campaign)); // Convert Mongoose doc to plain object
    setMemoryCache(plain);

    if (redis.isConnected && redis.client) {
      try {
        await redis.set(redisKey, JSON.stringify(plain), REDIS_TTL_SECONDS);
      } catch {
        // Redis write failed - continue without caching
      }
    }
  } else {
    clearMemoryCache();
    // Cache null result in Redis to avoid hammering DB
    if (redis.isConnected && redis.client) {
      try {
        await redis.set(redisKey, JSON.stringify(null), REDIS_TTL_SECONDS);
      } catch {
        // Ignore
      }
    }
  }

  return { campaign, serverTime: now.getTime() };
}

/**
 * Check if a course is within the campaign's scope.
 * Follows the same "every()" philosophy as validateCouponScope:
 * - scope='all': all courses included unless in excludedCourses
 * - scope='categories': course's category must be in campaign.categories
 */
export function isCourseInCampaignScope(course: any, campaign: any): boolean {
  if (!campaign || !campaign.isActive) return false;

  const courseId = course._id?.toString?.() || course._id || course;
  const courseCategoryId = course.category?.toString?.() || course.category;

  // Check excluded courses first (escape hatch)
  if (campaign.excludedCourses?.length > 0) {
    const excluded = campaign.excludedCourses.map((id: any) => id.toString());
    if (excluded.includes(courseId)) {
      return false;
    }
  }

  if (campaign.scope === 'all') {
    return true;
  }

  if (campaign.scope === 'categories') {
    if (!campaign.categories?.length) return false;
    if (!courseCategoryId) return false;
    const allowed = campaign.categories.map((id: any) => id.toString());
    return allowed.includes(courseCategoryId);
  }

  return false;
}

/**
 * Compute the campaign price for a course.
 * Applies percentage or fixed discount, respects maxDiscount cap.
 * Returns the new price (floored to integer Rial), never negative.
 */
export function computeCampaignPrice(
  baseCurrentPrice: number,
  originalPrice: number,
  campaign: any,
): number {
  if (!campaign || !campaign.isActive) return baseCurrentPrice;

  let discountedPrice: number;

  if (campaign.discountType === 'percentage') {
    const discountAmount = Math.floor((baseCurrentPrice * campaign.discountValue) / 100);
    const cappedDiscount = campaign.maxDiscount
      ? Math.min(discountAmount, campaign.maxDiscount)
      : discountAmount;
    discountedPrice = baseCurrentPrice - cappedDiscount;
  } else {
    // fixed discount
    discountedPrice = baseCurrentPrice - campaign.discountValue;
  }

  // Never go below zero
  return Math.max(0, Math.floor(discountedPrice));
}

/**
 * Clear both Redis and in-process caches.
 * Call this on every campaign mutation (create/update/delete/activate/deactivate).
 */
export async function clearCampaignCache(): Promise<void> {
  clearMemoryCache();

  const redisKey = getRedisCacheKey();
  if (redis.isConnected && redis.client) {
    try {
      await redis.del(redisKey);
    } catch {
      // Ignore Redis errors
    }
  }
}
