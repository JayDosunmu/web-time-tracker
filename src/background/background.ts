/**
 * Background service orchestrating browser events and time tracking
 */

import type { ActiveSession } from '../../types';
import type { StorageManager } from './models/StorageManager';
import type { TimeTracker } from './services/TimeTracker';

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
      await this.timeTracker.startSession(domain, activeInfo.tabId, activeInfo.windowId);
      
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
      await this.timeTracker.startSession(domain, tabId, tab.windowId!);
      
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
        await this.timeTracker.pauseSession();
        console.log('Window lost focus - paused tracking');
      } else {
        // Window gained focus - resume tracking if paused
        if (activeSession.isPaused) {
          await this.timeTracker.resumeSession();
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
      await this.timeTracker.startSession(domain, details.tabId, tab.windowId!);
      
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