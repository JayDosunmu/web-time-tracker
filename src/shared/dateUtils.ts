/**
 * Shared date utilities for consistent date handling across the extension.
 * All date operations use local timezone to match user expectations.
 */

/**
 * Get date key from timestamp in YYYY-MM-DD format (local timezone)
 * @param timestamp - Unix timestamp in milliseconds (defaults to now)
 * @returns Date string in YYYY-MM-DD format
 */
export function getDateKey(timestamp: number = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get midnight timestamp for a date (in local timezone)
 * @param timestamp - Unix timestamp in milliseconds (defaults to now)
 * @returns Timestamp of midnight (00:00:00.000) for the given date
 */
export function getMidnightTimestamp(timestamp: number = Date.now()): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Storage key prefix for day records
 */
export const DAY_STORAGE_PREFIX = "day_";

/**
 * Get the storage key for a day record
 * @param timestamp - Unix timestamp in milliseconds (defaults to now)
 * @returns Storage key in format "day_YYYY-MM-DD"
 */
export function getDayStorageKey(timestamp: number = Date.now()): string {
  return `${DAY_STORAGE_PREFIX}${getDateKey(timestamp)}`;
}
