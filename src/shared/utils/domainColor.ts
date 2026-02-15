/**
 * Consistent color generation for domain names
 */

/**
 * Color palette - visually distinct, accessible colors
 */
const DOMAIN_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Violet
  "#06B6D4", // Cyan
  "#F97316", // Orange
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#6366F1", // Indigo
  "#84CC16", // Lime
  "#A855F7", // Purple
] as const;

/**
 * djb2 hash algorithm - produces consistent hash for the same input
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Get a consistent color for a domain name.
 * Same domain always returns the same color.
 */
export function getDomainColor(domain: string): string {
  const hash = hashString(domain.toLowerCase());
  return DOMAIN_COLORS[hash % DOMAIN_COLORS.length];
}
