/**
 * BadgeService - Manages the toolbar badge display
 *
 * Shows total daily tracked time on the extension toolbar icon.
 * Uses decimal hours format (e.g., "0.5h", "2.5h", "12h").
 */

import type { HistoryRepository } from "../../shared/repositories";
import { getDateKey } from "../../shared/utils";
import type { DataModelManager } from "./DataModelManager";

// Get the appropriate action API (MV3 uses 'action', MV2 uses 'browserAction')
const actionApi = browser.action ?? browser.browserAction;

export class BadgeService {
  private static instance: BadgeService | null = null;

  private historyRepository: HistoryRepository;
  private dataModelManager: DataModelManager;

  private constructor(
    historyRepository: HistoryRepository,
    dataModelManager: DataModelManager,
  ) {
    this.historyRepository = historyRepository;
    this.dataModelManager = dataModelManager;
  }

  public static getInstance(
    historyRepository?: HistoryRepository,
    dataModelManager?: DataModelManager,
  ): BadgeService {
    if (!BadgeService.instance) {
      if (!historyRepository || !dataModelManager) {
        throw new Error(
          "BadgeService must be initialized with dependencies on first call.",
        );
      }
      BadgeService.instance = new BadgeService(
        historyRepository,
        dataModelManager,
      );
    }
    return BadgeService.instance;
  }

  public static resetInstance(): void {
    BadgeService.instance = null;
  }

  /**
   * Format milliseconds to compact badge text
   * Uses decimal hours format (e.g., "0.5h", "2.5h", "12h")
   */
  formatBadgeTime(ms: number): string {
    const hours = ms / (1000 * 60 * 60);

    if (hours < 10) {
      // Show one decimal place for precision (e.g., "0.5h", "2.5h")
      return `${hours.toFixed(1)}h`;
    }
    // Round to whole hours at 10+ (e.g., "12h")
    return `${Math.round(hours)}h`;
  }

  /**
   * Update the badge with the given total time
   */
  async updateBadge(totalTimeMs: number): Promise<void> {
    try {
      const text = this.formatBadgeTime(totalTimeMs);
      await actionApi.setBadgeText({ text });
      await actionApi.setBadgeBackgroundColor({ color: "#4285f4" });
    } catch (error) {
      console.error("BadgeService.updateBadge error:", error);
    }
  }

  /**
   * Clear the badge (e.g., on day reset)
   */
  async clearBadge(): Promise<void> {
    try {
      await actionApi.setBadgeText({ text: "" });
    } catch (error) {
      console.error("BadgeService.clearBadge error:", error);
    }
  }

  /**
   * Refresh the badge with current total time for today
   * Includes any active session elapsed time
   */
  async refreshBadge(): Promise<void> {
    try {
      // Get stored total for today
      const todayKey = getDateKey(Date.now());
      const todayData = await this.historyRepository.getDay(todayKey);
      let total = todayData?.totalTime ?? 0;

      // Add active session elapsed time if currently tracking
      const activeTab = this.dataModelManager.getActiveTab();
      if (activeTab?.active) {
        total += Date.now() - activeTab.lastTimerCheck;
      }

      await this.updateBadge(total);
    } catch (error) {
      console.error("BadgeService.refreshBadge error:", error);
    }
  }
}
