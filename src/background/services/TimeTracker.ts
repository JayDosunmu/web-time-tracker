/**
 * Core time tracking service
 *
 * Provides session management and time calculation utilities.
 * Delegates to DataModelManager for state persistence and lifecycle events.
 */

import type { ActiveTab, ActiveSession, LifecycleEventContext } from "../../../types";
import type { DataModelManager } from "./DataModelManager";

export class TimeTracker {
  private static instance: TimeTracker | null = null;
  private dataModelManager: DataModelManager;

  private constructor(dataModelManager: DataModelManager) {
    this.dataModelManager = dataModelManager;
  }

  public static getInstance(dataModelManager?: DataModelManager): TimeTracker {
    if (!TimeTracker.instance) {
      if (!dataModelManager) {
        throw new Error("DataModelManager is required for first initialization");
      }
      TimeTracker.instance = new TimeTracker(dataModelManager);
    }
    return TimeTracker.instance;
  }

  public static resetInstance(): void {
    TimeTracker.instance = null;
  }

  /**
   * Extract domain from URL with robust error handling
   */
  public extractDomain(url: string): string {
    try {
      if (!url || typeof url !== "string") {
        return "unknown";
      }

      // Handle chrome:// and other special protocols
      if (
        url.startsWith("chrome://") ||
        url.startsWith("moz-extension://") ||
        url.startsWith("about:")
      ) {
        const parts = url.split("://");
        return parts.length > 1 ? parts[0] : "unknown";
      }

      // Parse URL using URL constructor
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      // Handle IP addresses and localhost
      if (!hostname) {
        return "unknown";
      }

      return hostname;
    } catch (error) {
      console.warn("Failed to extract domain from URL:", url, error);
      return "unknown";
    }
  }

  /**
   * Get duration of current session from active tab
   */
  public getSessionDuration(activeTab: ActiveTab | ActiveSession): number {
    // For backwards compatibility with ActiveSession
    if ("startTime" in activeTab && !("totalTime" in activeTab)) {
      const session = activeTab as ActiveSession;
      const now = performance.now();
      return Math.max(0, now - session.startTime);
    }

    // For new ActiveTab model
    return this.dataModelManager.getCurrentDisplayTime();
  }

  /**
   * Start a new tracking session
   */
  public async startSession(
    domain: string,
    tabId: number,
    windowId: number
  ): Promise<ActiveTab> {
    try {
      // Validate inputs
      if (!domain || domain.trim() === "") {
        throw new Error("Domain cannot be empty");
      }

      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error("TabId must be a positive number");
      }

      if (!Number.isInteger(windowId) || windowId < 0) {
        throw new Error("WindowId must be a positive number");
      }

      // Create lifecycle event context
      const context: LifecycleEventContext = {
        timestamp: Date.now(),
        domain: domain.trim(),
        tabId,
        windowId,
      };

      // Delegate to DataModelManager
      return await this.dataModelManager.handleTabEnter(context);
    } catch (error) {
      console.error("TimeTracker.startSession error:", error);
      throw new Error(`Failed to start session: ${error}`);
    }
  }

  /**
   * Stop the current session
   */
  public async stopSession(): Promise<void> {
    try {
      await this.dataModelManager.handleTabExit();
    } catch (error) {
      console.error("TimeTracker.stopSession error:", error);
      throw new Error(`Failed to stop session: ${error}`);
    }
  }

  /**
   * Pause the current session
   */
  public async pauseSession(): Promise<ActiveTab | null> {
    try {
      return await this.dataModelManager.pauseSession();
    } catch (error) {
      console.error("TimeTracker.pauseSession error:", error);
      throw new Error(`Failed to pause session: ${error}`);
    }
  }

  /**
   * Resume a paused session
   */
  public async resumeSession(): Promise<ActiveTab | null> {
    try {
      return await this.dataModelManager.resumeSession();
    } catch (error) {
      console.error("TimeTracker.resumeSession error:", error);
      throw new Error(`Failed to resume session: ${error}`);
    }
  }

  /**
   * Get the current active tab state
   */
  public getActiveTab(): ActiveTab | null {
    return this.dataModelManager.getActiveTab();
  }

  /**
   * Get current display time for the active session
   */
  public getCurrentDisplayTime(): number {
    return this.dataModelManager.getCurrentDisplayTime();
  }
}
