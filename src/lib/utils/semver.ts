/**
 * Semver utility helpers — thin wrappers over the `semver` npm package.
 * All version comparisons in the panel go through these helpers.
 */
import semver from "semver";

/**
 * Returns true when `version` is greater than or equal to `floor`.
 */
export function isAtLeast(version: string, floor: string): boolean {
  return semver.gte(version, floor);
}

/**
 * Returns true when `a` is strictly greater than `b`.
 */
export function isNewer(a: string, b: string): boolean {
  return semver.gt(a, b);
}

/**
 * Returns true when `version` is >= `min` and (if `max` is supplied) <= `max`.
 */
export function withinRange(version: string, min: string, max?: string): boolean {
  if (!semver.gte(version, min)) return false;
  if (max !== undefined && !semver.lte(version, max)) return false;
  return true;
}

/**
 * Returns true when `v` is a valid semver string.
 */
export function isValid(v: string): boolean {
  return semver.valid(v) !== null;
}

/**
 * Comparator that orders newest-first when passed to `Array.prototype.sort`.
 * Returns a negative number when `a` is newer than `b`, positive when older,
 * zero when equal.
 */
export function compareDesc(a: string, b: string): number {
  return semver.rcompare(a, b);
}
