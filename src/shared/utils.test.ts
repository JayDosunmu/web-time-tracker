import {
  normalizeToReferencePhase,
  getDateKey,
  getMidnightTimestamp,
} from "./utils";

describe("dateUtils", () => {
  describe("normalizeToReferencePhase", () => {
    it("should set target milliseconds to match reference milliseconds", () => {
      const reference = 5123; // 123ms into second 5
      const target = 8456; // 456ms into second 8

      const result = normalizeToReferencePhase(reference, target);

      // Should be 8123 (second 8 with 123ms)
      expect(result).toBe(8123);
      expect(result % 1000).toBe(reference % 1000);
    });

    it("should handle zero reference milliseconds", () => {
      const reference = 5000; // exactly on second boundary
      const target = 8456;

      const result = normalizeToReferencePhase(reference, target);

      expect(result).toBe(8000);
      expect(result % 1000).toBe(0);
    });

    it("should handle zero target", () => {
      const reference = 5123;
      const target = 0;

      const result = normalizeToReferencePhase(reference, target);

      expect(result).toBe(123);
      expect(result % 1000).toBe(123);
    });

    it("should handle large timestamps", () => {
      const reference = 1707800000500; // some timestamp with 500ms
      const target = 1707800005789; // different timestamp with 789ms

      const result = normalizeToReferencePhase(reference, target);

      expect(result % 1000).toBe(500);
      expect(Math.floor(result / 1000)).toBe(Math.floor(target / 1000));
    });

    it("should preserve seconds portion of target", () => {
      const reference = 1500;
      const target = 12345;

      const result = normalizeToReferencePhase(reference, target);

      // Seconds portion should be preserved (12 seconds = 12000ms)
      expect(Math.floor(result / 1000)).toBe(12);
      // Millis should match reference
      expect(result % 1000).toBe(500);
    });
  });

  describe("getDateKey", () => {
    it("should return date in YYYY-MM-DD format", () => {
      // Use a fixed date to avoid timezone issues in tests
      const date = new Date(2024, 0, 15, 12, 0, 0); // Jan 15, 2024
      const result = getDateKey(date.getTime());

      expect(result).toBe("2024-01-15");
    });
  });

  describe("getMidnightTimestamp", () => {
    it("should return midnight timestamp for given date", () => {
      const date = new Date(2024, 0, 15, 14, 30, 45);
      const midnight = getMidnightTimestamp(date.getTime());

      const midnightDate = new Date(midnight);
      expect(midnightDate.getHours()).toBe(0);
      expect(midnightDate.getMinutes()).toBe(0);
      expect(midnightDate.getSeconds()).toBe(0);
      expect(midnightDate.getMilliseconds()).toBe(0);
    });
  });
});
