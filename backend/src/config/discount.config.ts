/**
 * 🎯 Business Rule: Maximum Total Discount Percentage
 *
 * This is a BUSINESS POLICY, not a technical limit.
 * It caps the combined discount from all sources (course's own discount + campaign + coupon)
 * to prevent margin erosion.
 *
 * Change this value only with business approval.
 * If you need different caps for different scenarios, extend this config with a more
 * sophisticated rule engine — but keep the default simple and explicit.
 */
export const MAX_TOTAL_DISCOUNT_PERCENT = 80;

/**
 * Helper to compute the minimum allowed price after all discounts
 * given an original price in Toman.
 */
export function getMinimumAllowedPrice(originalPrice: number): number {
  return Math.floor(originalPrice * (1 - MAX_TOTAL_DISCOUNT_PERCENT / 100));
}