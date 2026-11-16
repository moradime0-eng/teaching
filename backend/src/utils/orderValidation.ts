/** A reorder must be an exact permutation, otherwise items can be lost or receive duplicate positions. */
export function isExactOrder(ids: unknown, existingIds: string[]): ids is string[] {
  return Array.isArray(ids) && ids.length === existingIds.length &&
    ids.every(id => typeof id === 'string') && new Set(ids).size === existingIds.length &&
    ids.every(id => existingIds.includes(id));
}
