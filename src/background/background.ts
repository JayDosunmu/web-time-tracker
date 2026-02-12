/**
 * Background service orchestrating browser events and time tracking
 */

import type {
  ActiveTab,
  ExtensionMessageUnion,
  MessageResponse,
  GetSessionStateMessage,
  SessionStateResponseMessage,
  SessionUpdateMessage,
  SettingsChangeMessage,
  ErrorReportMessage,
  GetSettingsMessage,
  UpdatePillPositionMessage,
  ExtensionSettings,
} from "../../types";
import { DataModelManager } from "./services/DataModelManager";
import { TimeTracker } from "./services/TimeTracker";
import { HistoryRepository } from "./repositories/HistoryRepository";
import { TabRepository } from "./repositories/TabRepository";
import { SettingsRepository } from "./repositories/SettingsRepository";

export class BackgroundService {
  private static instance: BackgroundService | null = null;
  private dataModelManager: DataModelManager;
  private timeTracker: TimeTracker;
  private settingsRepository: SettingsRepository;
  private initialized = false;

  private constructor(
    dataModelManager: DataModelManager,
    timeTracker: TimeTracker,
    settingsRepository: SettingsRepository,
  ) {
    this.dataModelManager = dataModelManager;
    this.timeTracker = timeTracker;
    this.settingsRepository = settingsRepository;
  }

  public static getInstance(
    dataModelManager?: DataModelManager,
    timeTracker?: TimeTracker,
    settingsRepository?: SettingsRepository,
  ): BackgroundService {
    if (!BackgroundService.instance) {
      if (!dataModelManager || !timeTracker || !settingsRepository) {
        throw new Error(
          "DataModelManager, TimeTracker, and SettingsRepository are required for first initialization",
        );
      }
      BackgroundService.instance = new BackgroundService(
        dataModelManager,
        timeTracker,
        settingsRepository,
      );
    }
    return BackgroundService.instance;
  }

  public static resetInstance(): void {
    BackgroundService.instance = null;
  }

  /**
   * Initialize the background service and register event listeners
   */
  public async initialize(): Promise<void> {
    try {
      if (this.initialized) {
        return;
      }

      // Initialize data model manager
      await this.dataModelManager.initialize();

      // Register browser event listeners
      this.registerEventListeners();

      // Register message listeners for content script communication
      this.registerMessageListeners();

      this.initialized = true;
      console.log("BackgroundService initialized successfully");
    } catch (error) {
      console.error("BackgroundService.initialize error:", error);
      throw new Error(`Failed to initialize background service: ${error}`);
    }
  }

  /**
   * Check if the service is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current active session
   */
  public getActiveTab(): ActiveTab | null {
    return this.dataModelManager.getActiveTab();
  }

  /**
   * Shutdown the service and clean up active sessions
   */
  public async shutdown(): Promise<void> {
    try {
      const activeTab = this.dataModelManager.getActiveTab();
      if (activeTab) {
        await this.timeTracker.stopSession();
      }
      console.log("BackgroundService shutdown completed");
    } catch (error) {
      console.error("BackgroundService.shutdown error:", error);
    }
  }

  /**
   * Register message listeners for content script communication
   */
  private registerMessageListeners(): void {
    browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  /**
   * Handle messages from content scripts
   */
  private async handleMessage(
    message: ExtensionMessageUnion,
    sender: browser.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ): Promise<boolean> {
    try {
      console.log(
        `BackgroundService received message: ${message.type}`,
        message,
      );

      switch (message.type) {
        case "GET_SESSION_STATE":
          await this.handleGetSessionState(
            message as GetSessionStateMessage,
            sendResponse,
          );
          break;

        case "ERROR_REPORT":
          await this.handleErrorReport(
            message as ErrorReportMessage,
            sendResponse,
          );
          break;

        case "GET_SETTINGS":
          await this.handleGetSettings(
            message as GetSettingsMessage,
            sendResponse,
          );
          break;

        case "UPDATE_PILL_POSITION":
          await this.handleUpdatePillPosition(
            message as UpdatePillPositionMessage,
            sendResponse,
            sender,
          );
          break;

        default:
          console.warn(
            `BackgroundService: Unhandled message type: ${message.type}`,
          );
          sendResponse({
            success: false,
            error: `Unhandled message type: ${message.type}`,
          });
          break;
      }

      return true; // Keep message channel open for async response
    } catch (error) {
      console.error("BackgroundService.handleMessage error:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : "Message handling failed",
      });
      return true;
    }
  }

  /**
   * Handle session state requests from content scripts
   */
  private async handleGetSessionState(
    message: GetSessionStateMessage,
    sendResponse: (response: MessageResponse) => void,
  ): Promise<void> {
    try {
      const activeTab = this.dataModelManager.getActiveTab();

      if (!activeTab || activeTab.domain !== message.payload.domain) {
        sendResponse({
          success: true,
          data: null,
        });
        return;
      }

      const currentTime = this.timeTracker.getCurrentDisplayTime();

      const responseData: SessionStateResponseMessage["payload"] = {
        domain: activeTab.domain,
        currentTime,
        isActive: activeTab.active,
        isPaused: !activeTab.active,
        startTime: activeTab.lastActivated,
      };

      sendResponse({
        success: true,
        data: responseData,
      });
    } catch (error) {
      console.error("BackgroundService.handleGetSessionState error:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get session state",
      });
    }
  }

  /**
   * Handle error reports from content scripts
   */
  private async handleErrorReport(
    message: ErrorReportMessage,
    sendResponse: (response: MessageResponse) => void,
  ): Promise<void> {
    try {
      console.error(`Content script error [${message.payload.context}]:`, {
        error: message.payload.error,
        stackTrace: message.payload.stackTrace,
      });

      sendResponse({ success: true });
    } catch (error) {
      console.error("BackgroundService.handleErrorReport error:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to handle error report",
      });
    }
  }

  /**
   * Handle settings requests from content scripts
   */
  private async handleGetSettings(
    _message: GetSettingsMessage,
    sendResponse: (response: MessageResponse) => void,
  ): Promise<void> {
    try {
      const settings = await this.settingsRepository.getSettings();
      sendResponse({
        success: true,
        data: settings,
      });
    } catch (error) {
      console.error("BackgroundService.handleGetSettings error:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get settings",
      });
    }
  }

  /**
   * Handle pill position updates from content scripts
   */
  private async handleUpdatePillPosition(
    message: UpdatePillPositionMessage,
    sendResponse: (response: MessageResponse) => void,
    sender: browser.runtime.MessageSender,
  ): Promise<void> {
    try {
      await this.settingsRepository.updateSettings({
        pillPosition: message.payload.position,
      });

      // Only broadcast to other tabs for user-initiated drags
      // Window resize saves position but doesn't need cross-tab sync
      if (message.payload.source === "user_drag") {
        await this.broadcastSettingsChange(
          { pillPosition: message.payload.position },
          sender.tab?.id,
        );
      }

      sendResponse({ success: true });
    } catch (error) {
      console.error("BackgroundService.handleUpdatePillPosition error:", error);
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update pill position",
      });
    }
  }

  /**
   * Broadcast settings changes to all content scripts
   * @param settings - Partial settings that changed
   * @param excludeTabId - Optional tab ID to exclude (the one that initiated the change)
   */
  private async broadcastSettingsChange(
    settings: Partial<ExtensionSettings>,
    excludeTabId?: number,
  ): Promise<void> {
    try {
      const settingsMessage: SettingsChangeMessage = {
        type: "SETTINGS_CHANGE",
        payload: settings,
        id: `bg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: Date.now(),
      };

      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.id !== excludeTabId) {
          try {
            await browser.tabs.sendMessage(tab.id, settingsMessage);
          } catch {
            // Content script may not be loaded on this tab - this is normal
          }
        }
      }
    } catch (error) {
      console.error("BackgroundService.broadcastSettingsChange error:", error);
    }
  }

  /**
   * Send session update to a specific tab
   */
  private async sendSessionUpdate(activeTab: ActiveTab): Promise<void> {
    try {
      const currentTime = this.timeTracker.getCurrentDisplayTime();

      const updateMessage: SessionUpdateMessage = {
        type: "SESSION_UPDATE",
        payload: {
          domain: activeTab.domain,
          currentTime,
          isActive: activeTab.active,
          isPaused: !activeTab.active,
          startTime: activeTab.lastActivated,
        },
        id: `bg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: Date.now(),
      };

      // Get current settings to push alongside session update
      const settings = await this.settingsRepository.getSettings();
      const settingsMessage: SettingsChangeMessage = {
        type: "SETTINGS_CHANGE",
        payload: {
          pillPosition: settings.pillPosition,
          pillVisibility: settings.pillVisibility,
        },
        id: `bg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: Date.now(),
      };

      // Send to all tabs with matching domain
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.url) {
          const domain = this.timeTracker.extractDomain(tab.url);
          if (domain === activeTab.domain) {
            try {
              await browser.tabs.sendMessage(tab.id, updateMessage);
              // Push settings alongside session update
              await browser.tabs.sendMessage(tab.id, settingsMessage);
            } catch (error) {
              // Content script may not be loaded on this tab - this is normal
              console.debug(`Failed to send message to tab ${tab.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error("BackgroundService.sendSessionUpdate error:", error);
    }
  }

  /**
   * Register all browser event listeners
   */
  private registerEventListeners(): void {
    // Tab activation event
    browser.tabs.onActivated.addListener(this.handleTabActivated.bind(this));

    // Tab URL change event
    browser.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));

    // Window focus change event
    browser.windows.onFocusChanged.addListener(
      this.handleWindowFocusChanged.bind(this),
    );

    // Page navigation completion event
    browser.webNavigation.onCompleted.addListener(
      this.handleNavigationCompleted.bind(this),
    );
  }

  /**
   * Handle tab activation events
   */
  private async handleTabActivated(activeInfo: {
    tabId: number;
    windowId: number;
  }): Promise<void> {
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);

      if (!tab.url || !this.isValidUrl(tab.url)) {
        return;
      }

      const domain = this.timeTracker.extractDomain(tab.url);

      // Check if domain is excluded
      if (await this.isDomainExcluded(domain)) {
        return;
      }

      // Stop current session if active
      const activeTab = this.dataModelManager.getActiveTab();
      if (activeTab) {
        await this.timeTracker.stopSession();
      }

      // Start new session for the activated tab
      const newActiveTab = await this.timeTracker.startSession(
        domain,
        activeInfo.tabId,
        activeInfo.windowId,
      );

      // Broadcast session update to content scripts
      await this.sendSessionUpdate(newActiveTab);

      console.log(`Started tracking session for domain: ${domain}`);
    } catch (error) {
      console.error("BackgroundService.handleTabActivated error:", error);
      // Continue operation despite errors
    }
  }

  /**
   * Handle tab update events (URL changes)
   */
  private async handleTabUpdated(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab,
  ): Promise<void> {
    try {
      // Only process URL changes in active tabs
      if (!changeInfo.url || !tab.active) {
        return;
      }

      if (!this.isValidUrl(changeInfo.url)) {
        return;
      }

      const domain = this.timeTracker.extractDomain(changeInfo.url);

      // Check if domain is excluded
      if (await this.isDomainExcluded(domain)) {
        return;
      }

      // Stop current session if active
      const activeTab = this.dataModelManager.getActiveTab();
      if (activeTab) {
        await this.timeTracker.stopSession();
      }

      // Start new session for the updated URL
      const newActiveTab = await this.timeTracker.startSession(
        domain,
        tabId,
        tab.windowId!,
      );

      // Broadcast session update to content scripts
      await this.sendSessionUpdate(newActiveTab);

      console.log(
        `URL changed - started tracking session for domain: ${domain}`,
      );
    } catch (error) {
      console.error("BackgroundService.handleTabUpdated error:", error);
      // Continue operation despite errors
    }
  }

  /**
   * Handle window focus change events
   */
  private async handleWindowFocusChanged(windowId: number): Promise<void> {
    try {
      const activeTab = this.dataModelManager.getActiveTab();

      if (!activeTab) {
        return;
      }

      if (windowId === browser.windows.WINDOW_ID_NONE) {
        // Window lost focus - pause tracking
        const pausedTab = await this.timeTracker.pauseSession();
        if (pausedTab) {
          await this.sendSessionUpdate(pausedTab);
        }
        console.log("Window lost focus - paused tracking");
      } else {
        // Window gained focus - resume tracking if paused
        if (!activeTab.active) {
          const resumedTab = await this.timeTracker.resumeSession();
          if (resumedTab) {
            await this.sendSessionUpdate(resumedTab);
          }
          console.log("Window gained focus - resumed tracking");
        }
      }
    } catch (error) {
      console.error("BackgroundService.handleWindowFocusChanged error:", error);
      // Continue operation despite errors
    }
  }

  /**
   * Handle navigation completion events
   */
  private async handleNavigationCompleted(details: {
    tabId: number;
    frameId: number;
    url: string;
  }): Promise<void> {
    try {
      // Only process main frame navigation (not iframes)
      if (details.frameId !== 0) {
        return;
      }

      if (!this.isValidUrl(details.url)) {
        return;
      }

      // Get tab information
      const tab = await browser.tabs.get(details.tabId);

      // Only process active tabs
      if (!tab.active) {
        return;
      }

      const domain = this.timeTracker.extractDomain(details.url);

      // Check if domain is excluded
      if (await this.isDomainExcluded(domain)) {
        return;
      }

      // Stop current session if active
      const activeTab = this.dataModelManager.getActiveTab();
      if (activeTab) {
        await this.timeTracker.stopSession();
      }

      // Start new session for the completed navigation
      const newActiveTab = await this.timeTracker.startSession(
        domain,
        details.tabId,
        tab.windowId!,
      );

      // Broadcast session update to content scripts
      await this.sendSessionUpdate(newActiveTab);

      console.log(
        `Navigation completed - started tracking session for domain: ${domain}`,
      );
    } catch (error) {
      console.error(
        "BackgroundService.handleNavigationCompleted error:",
        error,
      );
      // Continue operation despite errors
    }
  }

  /**
   * Check if a URL is valid for tracking
   */
  private isValidUrl(url: string): boolean {
    if (!url || typeof url !== "string") {
      return false;
    }

    try {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol;

      // Only track http and https URLs
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Check if a domain is in the excluded list
   */
  private async isDomainExcluded(domain: string): Promise<boolean> {
    try {
      return await this.settingsRepository.isDomainExcluded(domain);
    } catch (error) {
      console.error("BackgroundService.isDomainExcluded error:", error);
      return false; // Default to not excluded if settings can't be loaded
    }
  }
}

// --- Bootstrap ---

/**
 * Initialize and start the background service
 */
(async function bootstrap(): Promise<void> {
  try {
    const storage = browser.storage.local;

    // Initialize repositories
    const historyRepository = HistoryRepository.getInstance(storage);
    const tabRepository = TabRepository.getInstance(storage);
    const settingsRepository = SettingsRepository.getInstance(storage);

    // Initialize DataModelManager
    const dataModelManager = DataModelManager.getInstance(
      historyRepository,
      tabRepository,
      settingsRepository,
    );

    // Initialize TimeTracker
    const timeTracker = TimeTracker.getInstance(dataModelManager);

    // Initialize BackgroundService
    const backgroundService = BackgroundService.getInstance(
      dataModelManager,
      timeTracker,
      settingsRepository,
    );

    await backgroundService.initialize();
    console.log("Web Time Tracker background service started");
  } catch (error) {
    console.error("Failed to bootstrap background service:", error);
  }
})();
