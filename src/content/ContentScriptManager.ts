/**
 * Content script manager with singleton pattern and component lifecycle management
 *
 * Uses shared repositories to read state directly from browser.storage.local,
 * eliminating dependency on background script for data retrieval.
 */

import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import type {
  RefreshStateMessage,
  PillPosition,
  PositionChangeSource,
} from "../../types";
import { MessageRouter } from "./messaging/MessageRouter";
import { TimeDisplayPill, createTimeDisplayPill, type TimeDisplayPillApi } from "./components/TimeDisplayPill";
import {
  SettingsRepository,
  TabRepository,
  HistoryRepository,
} from "../shared/repositories";
import { PersistenceManager } from "../shared/storage/PersistenceManager";
import { getDateKey } from "../shared/utils";
import { extractHourTimes } from "../shared/session";

export class ContentScriptManager {
  private static instance: ContentScriptManager | null = null;
  private messageRouter: MessageRouter;
  private settingsRepository: SettingsRepository;
  private tabRepository: TabRepository;
  private historyRepository: HistoryRepository;
  private isInitialized = false;
  private currentDomain: string;
  private components = new Map<string, any>();
  private visibilityHandler: (() => void) | null = null;
  private abortController: AbortController | null = null;
  private ctx: ContentScriptContext | null = null;

  private constructor() {
    this.messageRouter = new MessageRouter();
    this.currentDomain = this.extractDomain(window.location.href);
    this.abortController = new AbortController();

    // Initialize repositories for direct storage access
    const storage = PersistenceManager.getInstance(browser.storage.local);
    this.settingsRepository = SettingsRepository.getInstance(storage);
    this.tabRepository = TabRepository.getInstance(storage);
    this.historyRepository = HistoryRepository.getInstance(storage);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ContentScriptManager {
    if (!ContentScriptManager.instance) {
      ContentScriptManager.instance = new ContentScriptManager();
    }
    return ContentScriptManager.instance;
  }

  /**
   * Reset instance for testing
   */
  public static resetInstance(): void {
    if (ContentScriptManager.instance) {
      ContentScriptManager.instance.destroy();
    }
    ContentScriptManager.instance = null;
  }

  /**
   * Set the WXT ContentScriptContext for Shadow DOM UI creation
   */
  public setContext(ctx: ContentScriptContext): void {
    this.ctx = ctx;
  }

  /**
   * Initialize the content script manager
   */
  public async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      console.log(
        `ContentScriptManager initializing for domain: ${this.currentDomain}`,
      );

      // Initialize message router
      this.messageRouter.initialize();

      // Register message handlers
      this.registerMessageHandlers();

      // Wait for DOM to be ready
      await this.waitForDOMReady();

      // Initialize and register components
      await this.initializeComponents();

      // Setup visibility change handler for reconnection
      this.setupVisibilityHandler();

      // Request initial session state from background
      await this.requestInitialState();

      this.isInitialized = true;
      console.log("ContentScriptManager initialized successfully");
    } catch (error) {
      console.error("ContentScriptManager.initialize error:", error);
      await this.reportError(
        "ContentScriptManager initialization failed",
        error,
      );
      throw error;
    }
  }

  /**
   * Check if manager is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current domain
   */
  public getDomain(): string {
    return this.currentDomain;
  }

  /**
   * Register a component
   */
  public registerComponent(name: string, component: any): void {
    this.components.set(name, component);
  }

  /**
   * Get a registered component
   */
  public getComponent<T = any>(name: string): T | null {
    return this.components.get(name) || null;
  }

  /**
   * Unregister a component
   */
  public unregisterComponent(componentName: string): void {
    const component = this.components.get(componentName);
    if (component && typeof component.destroy === "function") {
      component.destroy();
    }
    this.components.delete(componentName);
  }

  /**
   * Get message router instance
   */
  public getMessageRouter(): MessageRouter {
    return this.messageRouter;
  }

  /**
   * Handle URL changes (for single-page applications)
   */
  public handleUrlChange(newUrl: string): void {
    const newDomain = this.extractDomain(newUrl);
    if (newDomain !== this.currentDomain) {
      console.log(`Domain changed from ${this.currentDomain} to ${newDomain}`);
      this.currentDomain = newDomain;

      // Request new session state for the new domain
      this.requestInitialState().catch((error) => {
        console.error(
          "Failed to request session state after domain change:",
          error,
        );
      });
    }
  }

  /**
   * Initialize and register components
   */
  private async initializeComponents(): Promise<void> {
    try {
      // Read settings directly from storage via repository
      const settings = await this.settingsRepository.getSettings();

      // Create TimeDisplayPill using WXT's createShadowRootUi if context is available
      // Falls back to class-based approach for backward compatibility (tests)
      let timeDisplayPill: TimeDisplayPillApi;

      if (this.ctx) {
        // Use WXT factory function for HMR support and automatic cleanup
        timeDisplayPill = await createTimeDisplayPill(
          this.ctx,
          settings.pillPosition,
          settings.pillShowFullInfo,
          settings.pillHidden,
        );
      } else {
        // Fallback to class-based approach (for tests or non-WXT environments)
        timeDisplayPill = new TimeDisplayPill(
          settings.pillPosition,
          settings.pillShowFullInfo,
          settings.pillHidden,
        );
      }

      // Wire up callbacks for persistence
      timeDisplayPill.setPositionChangeCallback(
        this.handlePositionChange.bind(this),
      );
      timeDisplayPill.setShowFullInfoChangeCallback(
        this.handleShowFullInfoChange.bind(this),
      );
      timeDisplayPill.setHiddenChangeCallback(
        this.handleHiddenChange.bind(this),
      );

      this.registerComponent("timeDisplayPill", timeDisplayPill);

      // Apply visibility setting
      timeDisplayPill.onSettingsChange({
        pillVisibility: settings.pillVisibility,
      });

      console.log("Components initialized with settings from storage");
    } catch (error) {
      console.error("ContentScriptManager.initializeComponents error:", error);
      throw error;
    }
  }

  /**
   * Register message handlers
   */
  private registerMessageHandlers(): void {
    // Handle refresh state signals from background
    this.messageRouter.registerHandler<RefreshStateMessage>(
      "REFRESH_STATE",
      async (message) => {
        try {
          console.log(
            "ContentScriptManager received REFRESH_STATE:",
            message.payload.reason,
          );

          // Read fresh state from storage via repositories
          await this.readStateFromStorage();

          return { success: true };
        } catch (error) {
          console.error(
            "ContentScriptManager.handleRefreshState error:",
            error,
          );
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Refresh state handling failed",
          };
        }
      },
    );
  }

  /**
   * Read all state directly from storage via repositories
   * This is the primary method for getting session and settings data
   */
  private async readStateFromStorage(): Promise<void> {
    try {
      // Read settings and active tab in parallel
      const [settings, activeTab] = await Promise.all([
        this.settingsRepository.getSettings(),
        this.tabRepository.getActiveTab(),
      ]);

      // Build session state from activeTab if it matches current domain
      let sessionState = null;
      if (activeTab && activeTab.domain === this.currentDomain) {
        // Get today's day data for visitCount and totalTimeToday
        const todayKey = getDateKey(Date.now());
        const todayData = await this.historyRepository.getDay(todayKey);

        const visitCount =
          todayData?.domains[this.currentDomain]?.visitCount ?? 0;
        const totalTimeToday = todayData?.totalTime ?? 0;
        const hourTimes = extractHourTimes(todayData);

        sessionState = {
          domain: activeTab.domain,
          baseCurrentTime: activeTab.totalTime,
          baseTotalTimeToday: totalTimeToday,
          visitCount,
          isActive: activeTab.active,
          isPaused: !activeTab.active,
          startTime: activeTab.lastTimerCheck,
          hourTimes,
        };
      }

      // Update components with session state
      this.broadcastToComponents("onSessionUpdate", sessionState);

      // Update components with settings
      this.broadcastToComponents("onSettingsChange", {
        pillPosition: settings.pillPosition,
        pillVisibility: settings.pillVisibility,
        pillShowFullInfo: settings.pillShowFullInfo,
        pillHidden: settings.pillHidden,
      });

      console.log("State refreshed from storage");
    } catch (error) {
      console.error("Failed to read state from storage:", error);
    }
  }

  /**
   * Request initial session state by reading from storage
   * No longer depends on background service - reads directly via repositories
   */
  private async requestInitialState(): Promise<void> {
    console.log(`Reading session state for domain: ${this.currentDomain}`);
    await this.readStateFromStorage();
  }

  /**
   * Handle position changes from TimeDisplayPill drag or window resize
   */
  private async handlePositionChange(
    position: PillPosition,
    source: PositionChangeSource,
  ): Promise<void> {
    try {
      // Validate position before saving
      if (
        !position ||
        typeof position.x !== "number" ||
        typeof position.y !== "number" ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)
      ) {
        console.error("Invalid pill position, not saving:", position);
        return;
      }

      const response = await this.messageRouter.sendMessage({
        type: "UPDATE_PILL_POSITION",
        payload: { position, source },
      });

      if (!response.success) {
        console.error(
          "Failed to save pill position:",
          response.error || "No response from background",
        );
      }
    } catch (error) {
      console.error("Error saving pill position:", error);
    }
  }

  /**
   * Handle showFullInfo changes from TimeDisplayPill toggle
   */
  private async handleShowFullInfoChange(showFullInfo: boolean): Promise<void> {
    try {
      const response = await this.messageRouter.sendMessage({
        type: "UPDATE_PILL_SHOW_FULL_INFO",
        payload: { showFullInfo },
      });

      if (!response.success) {
        console.error(
          "Failed to save pill showFullInfo:",
          response.error || "No response from background",
        );
      }
    } catch (error) {
      console.error("Error saving pill showFullInfo:", error);
    }
  }

  /**
   * Handle hidden changes from TimeDisplayPill toggle
   */
  private async handleHiddenChange(hidden: boolean): Promise<void> {
    try {
      const response = await this.messageRouter.sendMessage({
        type: "UPDATE_PILL_HIDDEN",
        payload: { hidden },
      });

      if (!response.success) {
        console.error(
          "Failed to save pill hidden:",
          response.error || "No response from background",
        );
      }
    } catch (error) {
      console.error("Error saving pill hidden:", error);
    }
  }

  /**
   * Broadcast method call to all registered components
   */
  private broadcastToComponents(methodName: string, ...args: any[]): void {
    for (const [name, component] of this.components.entries()) {
      try {
        if (component && typeof component[methodName] === "function") {
          component[methodName](...args);
        }
      } catch (error) {
        console.error(
          `Error calling ${methodName} on component ${name}:`,
          error,
        );
      }
    }
  }

  /**
   * Setup visibility change handler for tab reconnection
   * When tab becomes visible again, request fresh state from background
   */
  private setupVisibilityHandler(): void {
    this.visibilityHandler = (): void => {
      if (document.visibilityState === "visible") {
        console.log("Tab became visible, requesting fresh session state");
        this.requestInitialState().catch((error) => {
          console.error(
            "Failed to request session state on visibility change:",
            error,
          );
        });
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  /**
   * Wait for DOM to be ready
   */
  private async waitForDOMReady(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => resolve(), {
          once: true,
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Extract domain from URL
   * TODO: this looks like a duplicate of the one in PersistenceManager.ts
   */
  private extractDomain(url: string): string {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname;
    } catch {
      return "unknown";
    }
  }

  /**
   * Report error to background service
   */
  private async reportError(context: string, error: unknown): Promise<void> {
    try {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : undefined;

      await this.messageRouter.reportError(errorMessage, context, stackTrace);
    } catch (reportError) {
      console.error(
        "Failed to report error to background service:",
        reportError,
      );
    }
  }

  /**
   * Cleanup resources and destroy manager
   */
  public destroy(): void {
    // Always abort pending operations, even if not fully initialized
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (!this.isInitialized) {
      return;
    }

    try {
      // Remove visibility change listener
      if (this.visibilityHandler) {
        document.removeEventListener(
          "visibilitychange",
          this.visibilityHandler,
        );
        this.visibilityHandler = null;
      }

      // Destroy all registered components
      for (const [_, component] of this.components.entries()) {
        if (component && typeof component.destroy === "function") {
          component.destroy();
        }
      }
      this.components.clear();

      // Destroy message router
      this.messageRouter.destroy();

      this.isInitialized = false;
      console.log("ContentScriptManager destroyed");
    } catch (error) {
      console.error("ContentScriptManager.destroy error:", error);
    }
  }
}
