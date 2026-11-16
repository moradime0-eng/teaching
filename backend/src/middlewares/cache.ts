import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import { getCurrentTenantId } from '../utils/tenantContext';
import { asyncHandler } from './asyncHandler';

/**
 * Generate a cache key from request details.
 * Pattern: cache:{tenantId}:u:{userId}:{method}:{path}:{queryHash}
 *
 * ⚠️ FIX: شناسه کاربر در کلید کش لحاظ می‌شود تا پاسخ‌های اختصاصی کاربر
 * (مثل unread-summary) بین کاربران مختلف به اشتراک گذاشته نشود.
 */
const generateCacheKey = (req: Request): string => {
  const tenantId = getCurrentTenantId() || (req as any).tenantId || 'global';
  const user = (req as any).user;
  const userId =
    user?._id?.toString?.() || user?.id?.toString?.() || (user ? String(user._id ?? user.id) : '');
  const path = req.originalUrl || req.url;
  // Simple hash of query params for uniqueness
  const queryString = JSON.stringify(req.query || {});
  const queryHash = require('crypto').createHash('md5').update(queryString).digest('hex').substring(0, 8);
  return `cache:${tenantId}:u:${userId || 'anon'}:${req.method}:${path}:${queryHash}`;
};

/**
 * Cache middleware — caches GET responses in Redis.
 * Falls through to database if Redis is unavailable.
 *
 * @param ttlSeconds — Time-to-live in seconds (default: 300 = 5 minutes)
 */
export const cacheMiddleware = (ttlSeconds: number = 300) => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip cache if Redis is not connected
    if (!redis.isConnected || !redis.client) {
      return next();
    }

    const cacheKey = generateCacheKey(req);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(parsed);
      }
    } catch {
      // Redis error — fall through to database
    }

    // Cache miss — intercept res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis.set(cacheKey, JSON.stringify(body), ttlSeconds).catch(() => {});
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    }) as any;

    next();
  });
};

/**
 * Clear cache entries matching a pattern.
 * Used as middleware or called directly from controllers.
 */
export const clearCache = (pattern: string) => {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const tenantId = getCurrentTenantId() || (req as any).tenantId;
      const cleanPattern = pattern.replace(/^[\*:/*]+/, '');
      const fullPattern = tenantId
        ? `cache:tenant:${tenantId}:*${cleanPattern}*`
        : `cache:*${cleanPattern}*`;
      await redis.delPattern(fullPattern);
    } catch (error) {
      console.error('Cache clear error:', error);
    }
    next();
  });
};

/**
 * Clear all cache for a specific tenant
 */
export const clearTenantCache = (tenantId: string) => {
  return redis.delPattern(`cache:${tenantId}:*`);
};

/**
 * Clear cache for a specific tenant and pattern
 */
export const clearTenantCachePattern = (tenantId: string, pattern: string) => {
  return redis.delPattern(`cache:${tenantId}:*${pattern}*`);
};

/**
 * Direct cache invalidation helper — call from controllers after mutations.
 */
export const invalidateCache = async (patterns: string[]): Promise<void> => {
  if (!redis.isConnected || !redis.client) return;
  for (const pattern of patterns) {
    await redis.delPattern(pattern).catch(() => {});
  }
};
