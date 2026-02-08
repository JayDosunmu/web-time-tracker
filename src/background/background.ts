/**
 * Background service orchestrating browser events and time tracking
 */

import type { 
  ActiveSession,
  ExtensionMessageUnion,
  MessageResponse,
  GetSessionStateMessage,
  SessionStateResponseMessage,
  SessionUpdateMessage,
  SettingsChangeMessage,
  ErrorReportMessage
} from '../../types';
import { StorageManager } from './models/StorageManager';
import { TimeTracker } from './services/TimeTracker';

export class BackgroundService {
  private static instance: BackgroundService | null = null;
  private storageManager: StorageManager;
  private timeTracker: TimeTracker;
  private initialized = false;

  private constructor(storageManager: StorageManager, timeTracker: TimeTracker) {
    this.storageManager = storageManager;
    this.timeTracker = timeTracker;
  }

  public static getInstance(storageManager?: StorageManager, timeTracker?: TimeTracker): BackgroundService {
    if (!BackgroundService.instance) {
      if (!storageManager || !timeTracker) {
        throw new Error('StorageManager and TimeTracker are required for first initialization');
      }
      BackgroundService.instance = new BackgroundService(storageManager, timeTracker);
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

      // Initialize storage
      await this.storageManager.initialize();

      // Register browser event listeners
      this.registerEventListeners();

      // Register message listeners for content script communication
      this.registerMessageListeners();

      this.initialized = true;
      console.log('BackgroundService initialized successfully');
    } catch (error) {
      console.error('BackgroundService.initialize error:', error);
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
  public async getCurrentSession(): Promise<ActiveSession | null> {
    return this.storageManager.getActiveSession();
  }

  /**
   * Shutdown the service and clean up active sessions
   */
  public async shutdown(): Promise<void> {
    try {
      const activeSession = await this.storageManager.getActiveSession();
      if (activeSession) {
        await this.timeTracker.stopSession();
      }
      console.log('BackgroundService shutdown completed');
    } catch (error) {
      console.error('BackgroundService.shutdown error:', error);
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
    _sender: browser.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<boolean> {
    try {
      console.log(`BackgroundService received message: ${message.type}`, message);

      switch (message.type) {
        case 'GET_SESSION_STATE':
          await this.handleGetSessionState(message as GetSessionStateMessage, sendResponse);
          break;

        case 'ERROR_REPORT':
          await this.handleErrorReport(message as ErrorReportMessage, sendResponse);
          break;

        default:
          console.warn(`BackgroundService: Unhandled message type: ${message.type}`);
          sendResponse({
            success: false,
            error: `Unhandled message type: ${message.type}`
          });
          break;
      }

      return true; // Keep message channel open for async response
    } catch (error) {
      console.error('BackgroundService.handleMessage error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Message handling failed'
      });
      return true;
    }
  }

  /**
   * Handle session state requests from content scripts
   */
  private async handleGetSessionState(
    message: GetSessionStateMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const activeSession = await this.storageManager.getActiveSession();
      
      if (!activeSession || activeSession.domain !== message.payload.domain) {
        sendResponse({
          success: true,
          data: null
        });
        return;
      }

      const currentTime = this.timeTracker.getSessionDuration(activeSession);
      
      const responseData: SessionStateResponseMessage['payload'] = {
        domain: activeSession.domain,
        currentTime,
        isActive: !activeSession.isPaused,
        isPaused: activeSession.isPaused || false,
        startTime: activeSession.startTime
      };

      sendResponse({
        success: true,
        data: responseData
      });
    } catch (error) {
      console.error('BackgroundService.handleGetSessionState error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get session state'
      });
    }
  }

  /**
   * Handle error reports from content scripts
   */
  private async handleErrorReport(
    message: ErrorReportMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      console.error(`Content script error [${message.payload.context}]:`, {
        error: message.payload.error,
        stackTrace: message.payload.stackTrace
      });

      sendResponse({ success: true });
    } catch (error) {
      console.error('BackgroundService.handleErrorReport error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to handle error report'
      });
    }
  }

  /**
   * Send session update to a specific tab
   */
  private async sendSessionUpdate(session: ActiveSession): Promise<void> {
    try {
      const currentTime = this.timeTracker.getSessionDuration(session);

      const updateMessage: SessionUpdateMessage = {
        type: 'SESSION_UPDATE',
        payload: {
          domain: session.domain,
          currentTime,
          isActive: !session.isPaused,
          isPaused: session.isPaused || false,
          startTime: session.startTime
        },
        id: `bg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: Date.now()
      };

      // Send only to the session's tab
      try {
        await browser.tabs.sendMessage(session.tabId, updateMessage);
      } catch (error) {
        // Content script may not be loaded on this tab - this is normal
        console.debug(`Failed to send message to tab ${session.tabId}:`, error);
      }
    } catch (error) {
      console.error('BackgroundService.sendSessionUpdate error:', error);
    }
  }

  /**
   * Broadcast settings changes to all content scripts
   * TODO: Integrate with settings management when popup is implemented
   */
  // @ts-expect-error Method will be used when popup settings are implemented
  private async broadcastSettingsChange(): Promise<void> {
    try {
      const settings = await this.storageManager.getSettings();
      
      const settingsMessage: Omit<SettingsChangeMessage, 'id' | 'timestamp'> = {
        type: 'SETTINGS_CHANGE',
        payload: {
          pillPosition: settings.pillPosition,
          pillVisibility: settings.pillVisibility,
          excludedDomains: settings.excludedDomains
        }
      };

      // Get all tabs to broadcast to
      const tabs = await browser.tabs.query({});
      
      for (const tab of tabs) {
        if (tab.id && tab.url && this.isValidUrl(tab.url)) {
          try {
            await browser.tabs.sendMessage(tab.id, {
              ...settingsMessage,
              id: `bg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              timestamp: Date.now()
            });
          } catch (error) {
            // Content script may not be loaded on this tab - this is normal
            console.debug(`Failed to send settings to tab ${tab.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('BackgroundService.broadcastSettingsChange error:', error);
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
    browser.windows.onFocusChanged.addListener(this.handleWindowFocusChanged.bind(this));

    // Page navigation completion event
    browser.webNavigation.onCompleted.addListener(this.handleNavigationCompleted.bind(this));
  }

  /**
   * Handle tab activation events
   */
  private async handleTabActivated(activeInfo: { tabId: number; windowId: number }): Promise<void> {
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
      const activeSession = await this.storageManager.getActiveSession();
      if (activeSession) {
        await this.timeTracker.stopSession();
      }

      // Start new session for the activated tab
      const newSession = await this.timeTracker.startSession(domain, activeInfo.tabId, activeInfo.windowId);
      
      // Broadcast session update to content scripts
      await this.sendSessionUpdate(newSession);
      
      console.log(`Started tracking session for domain: ${domain}`);
    } catch (error) {
      console.error('BackgroundService.handleTabActivated error:', error);
      // Continue operation despite errors
    }
  }

  /**
   * Handle tab update events (URL changes)
   */
  private async handleTabUpdated(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab
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
      const activeSession = await this.storageManager.getActiveSession();
      if (activeSession) {
        await this.timeTracker.stopSession();
      }

      // Start new session for the updated URL
      const newSession = await this.timeTracker.startSession(domain, tabId, tab.windowId!);
      
      // Broadcast session update to content scripts
      await this.sendSessionUpdate(newSession);
      
      console.log(`URL changed - started tracking session for domain: ${domain}`);
    } catch (error) {
      console.error('BackgroundService.handleTabUpdated error:', error);
      // Continue operation despite errors
    }
  }

  /**
   * Handle window focus change events
   */
  private async handleWindowFocusChanged(windowId: number): Promise<void> {
    try {
      const activeSession = await this.storageManager.getActiveSession();
      
      if (!activeSession) {
        return;
      }

      if (windowId === browser.windows.WINDOW_ID_NONE) {
        // Window lost focus - pause tracking
        const pausedSession = await this.timeTracker.pauseSession();
        if (pausedSession) {
          await this.sendSessionUpdate(pausedSession);
        }
        console.log('Window lost focus - paused tracking');
      } else {
        // Window gained focus - resume tracking if paused
        if (activeSession.isPaused) {
          const resumedSession = await this.timeTracker.resumeSession();
          if (resumedSession) {
            await this.sendSessionUpdate(resumedSession);
          }
          console.log('Window gained focus - resumed tracking');
        }
      }
    } catch (error) {
      console.error('BackgroundService.handleWindowFocusChanged error:', error);
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
      const activeSession = await this.storageManager.getActiveSession();
      if (activeSession) {
        await this.timeTracker.stopSession();
      }

      // Start new session for the completed navigation
      const newSession = await this.timeTracker.startSession(domain, details.tabId, tab.windowId!);
      
      // Broadcast session update to content scripts
      await this.sendSessionUpdate(newSession);
      
      console.log(`Navigation completed - started tracking session for domain: ${domain}`);
    } catch (error) {
      console.error('BackgroundService.handleNavigationCompleted error:', error);
      // Continue operation despite errors
    }
  }

  /**
   * Check if a URL is valid for tracking
   */
  private isValidUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol;
      
      // Only track http and https URLs
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if a domain is in the excluded list
   */
  private async isDomainExcluded(domain: string): Promise<boolean> {
    try {
      const settings = await this.storageManager.getSettings();
      return settings.excludedDomains.includes(domain);
    } catch (error) {
      console.error('BackgroundService.isDomainExcluded error:', error);
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
    const storageManager = StorageManager.getInstance(browser.storage.local);
    const timeTracker = TimeTracker.getInstance(storageManager);
    const backgroundService = BackgroundService.getInstance(storageManager, timeTracker);
    await backgroundService.initialize();
    console.log('Web Time Tracker background service started');
  } catch (error) {
    console.error('Failed to bootstrap background service:', error);
  }
})();