/**
 * Comprehensive tests for background service and browser event integration
 */

import browser from 'sinon-chrome';

import { BackgroundService } from '../../src/background/background';
import { testUtils } from '../utils';
import { mockActiveSession, mockExtensionSettings } from '../fixtures';

import type { StorageManager } from '../../src/background/models/StorageManager';
import type { TimeTracker } from '../../src/background/services/TimeTracker';

describe('BackgroundService', () => {
  let backgroundService: BackgroundService;
  let mockStorageManager: jest.Mocked<StorageManager>;
  let mockTimeTracker: jest.Mocked<TimeTracker>;
  
  // Event handler capture variables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tabActivatedHandler: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tabUpdatedHandler: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let windowFocusHandler: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webNavHandler: any;

  beforeEach(() => {
    testUtils.resetAll();
    
    // Create mock StorageManager
    mockStorageManager = {
      getActiveSession: jest.fn(),
      setActiveSession: jest.fn(),
      getDomainData: jest.fn(),
      updateDomainData: jest.fn(),
      getSettings: jest.fn(),
      initialize: jest.fn()
    } as unknown as jest.Mocked<StorageManager>;

    // Create mock TimeTracker
    mockTimeTracker = {
      startSession: jest.fn(),
      stopSession: jest.fn(),
      pauseSession: jest.fn(),
      resumeSession: jest.fn(),
      getCurrentSession: jest.fn(),
      extractDomain: jest.fn(),
      getSessionDuration: jest.fn()
    } as unknown as jest.Mocked<TimeTracker>;

    // Set up event handler capture using Jest mocks
    (browser.tabs.onActivated.addListener as unknown as jest.Mock).mockImplementation((handler) => {
      tabActivatedHandler = handler;
    });
    (browser.tabs.onUpdated.addListener as unknown as jest.Mock).mockImplementation((handler) => {
      tabUpdatedHandler = handler;
    });
    (browser.windows.onFocusChanged.addListener as unknown as jest.Mock).mockImplementation((handler) => {
      windowFocusHandler = handler;
    });
    (browser.webNavigation.onCompleted.addListener as unknown as jest.Mock).mockImplementation((handler) => {
      webNavHandler = handler;
    });

    // Reset and create BackgroundService with mocks
    BackgroundService.resetInstance();
    backgroundService = BackgroundService.getInstance(mockStorageManager, mockTimeTracker);

    // Set up default mock behaviors
    mockStorageManager.getSettings.mockResolvedValue(mockExtensionSettings);
    mockStorageManager.getActiveSession.mockResolvedValue(null);
    mockTimeTracker.extractDomain.mockReturnValue('example.com');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BackgroundService.getInstance();
      const instance2 = BackgroundService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance for testing', () => {
      const instance1 = BackgroundService.getInstance();
      BackgroundService.resetInstance();
      const instance2 = BackgroundService.getInstance(mockStorageManager, mockTimeTracker);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Service Initialization', () => {
    it('should initialize storage on startup', async () => {
      await backgroundService.initialize();

      expect(mockStorageManager.initialize).toHaveBeenCalled();
    });

    it('should register all browser event listeners on startup', async () => {
      await backgroundService.initialize();

      // Verify tab event listeners are registered using Jest assertions
      expect(browser.tabs.onActivated.addListener).toHaveBeenCalled();
      expect(browser.tabs.onUpdated.addListener).toHaveBeenCalled();
      
      // Verify window event listener is registered
      expect(browser.windows.onFocusChanged.addListener).toHaveBeenCalled();
      
      // Verify webNavigation event listener is registered
      expect(browser.webNavigation.onCompleted.addListener).toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockStorageManager.initialize.mockRejectedValue(new Error('Storage init failed'));

      await expect(backgroundService.initialize())
        .rejects.toThrow('Failed to initialize background service: Error: Storage init failed');
    });

    it('should not reinitialize if already initialized', async () => {
      await backgroundService.initialize();
      await backgroundService.initialize();

      // Should only be called once
      expect(mockStorageManager.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tab Event Handling', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('should start tracking when tab becomes active', async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const tabInfo = { id: 123, url: 'https://example.com/path', windowId: 1 };
      
      // Mock browser.tabs.get to return tab info
      browser.tabs.get.resolves(tabInfo);
      mockTimeTracker.startSession.mockResolvedValue(mockActiveSession);

      // Use captured event handler
      await tabActivatedHandler(activeInfo);

      // Use sinon assertions for browser API calls
      expect(browser.tabs.get.calledWith(123)).toBe(true);
      expect(mockTimeTracker.extractDomain).toHaveBeenCalledWith('https://example.com/path');
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith('example.com', 123, 1);
    });

    it('should stop current session before starting new one', async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const tabInfo = { id: 123, url: 'https://example.com', windowId: 1 };
      
      browser.tabs.get.resolves(tabInfo);
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);
      mockTimeTracker.stopSession.mockResolvedValue({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        tabId: mockActiveSession.tabId,
        windowId: mockActiveSession.windowId
      });

      await tabActivatedHandler(activeInfo);

      expect(mockTimeTracker.stopSession).toHaveBeenCalled();
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith('example.com', 123, 1);
    });

    it('should handle tab activation errors gracefully', async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      
      browser.tabs.get.rejects(new Error('Tab not found'));

      // Should not throw error
      await expect(tabActivatedHandler(activeInfo)).resolves.toBeUndefined();
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });

    it('should handle URL changes in active tab', async () => {
      const tabId = 123;
      const changeInfo = { url: 'https://newsite.com' };
      const tab = { id: tabId, url: 'https://newsite.com', windowId: 1, active: true };
      
      browser.tabs.get.resolves(tab);
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);
      mockTimeTracker.extractDomain.mockReturnValue('newsite.com');
      mockTimeTracker.stopSession.mockResolvedValue({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        tabId: mockActiveSession.tabId,
        windowId: mockActiveSession.windowId
      });

      await tabUpdatedHandler(tabId, changeInfo, tab);

      expect(mockTimeTracker.stopSession).toHaveBeenCalled();
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith('newsite.com', tabId, 1);
    });

    it('should ignore URL changes in inactive tabs', async () => {
      const tabId = 123;
      const changeInfo = { url: 'https://newsite.com' };
      const tab = { id: tabId, url: 'https://newsite.com', windowId: 1, active: false };
      
      browser.tabs.get.resolves(tab);

      await tabUpdatedHandler(tabId, changeInfo, tab);

      expect(mockTimeTracker.stopSession).not.toHaveBeenCalled();
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });

    it('should ignore non-URL changes', async () => {
      const tabId = 123;
      const changeInfo = { status: 'loading' };
      const tab = { id: tabId, url: 'https://example.com', windowId: 1, active: true };

      await tabUpdatedHandler(tabId, changeInfo, tab);

      expect(mockTimeTracker.stopSession).not.toHaveBeenCalled();
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });
  });

  describe('Window Focus Handling', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('should pause tracking when window loses focus', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowId = (browser.windows as any).WINDOW_ID_NONE;
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);
      mockTimeTracker.pauseSession.mockResolvedValue({ ...mockActiveSession, isPaused: true });

      await windowFocusHandler(windowId);

      expect(mockTimeTracker.pauseSession).toHaveBeenCalled();
    });

    it('should resume tracking when window regains focus', async () => {
      const windowId = 1;
      const pausedSession = { ...mockActiveSession, isPaused: true };
      mockStorageManager.getActiveSession.mockResolvedValue(pausedSession);
      mockTimeTracker.resumeSession.mockResolvedValue(mockActiveSession);

      await windowFocusHandler(windowId);

      expect(mockTimeTracker.resumeSession).toHaveBeenCalled();
    });

    it('should not pause if no active session', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowId = (browser.windows as any).WINDOW_ID_NONE;
      mockStorageManager.getActiveSession.mockResolvedValue(null);

      await windowFocusHandler(windowId);

      expect(mockTimeTracker.pauseSession).not.toHaveBeenCalled();
    });

    it('should handle window focus errors gracefully', async () => {
      const windowId = 1;
      mockStorageManager.getActiveSession.mockRejectedValue(new Error('Storage error'));

      // Should not throw error
      await expect(windowFocusHandler(windowId)).resolves.toBeUndefined();
    });
  });

  describe('WebNavigation Event Handling', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('should start tracking on page completion for main frame', async () => {
      const details = {
        tabId: 123,
        frameId: 0, // Main frame
        url: 'https://example.com/page'
      };
      
      const tab = { id: 123, url: 'https://example.com/page', windowId: 1, active: true };
      browser.tabs.get.resolves(tab);
      mockTimeTracker.extractDomain.mockReturnValue('example.com');
      mockTimeTracker.startSession.mockResolvedValue(mockActiveSession);

      await webNavHandler(details);

      expect(mockTimeTracker.extractDomain).toHaveBeenCalledWith('https://example.com/page');
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith('example.com', 123, 1);
    });

    it('should ignore subframe navigation', async () => {
      const details = {
        tabId: 123,
        frameId: 1, // Subframe
        url: 'https://ads.example.com/iframe'
      };

      await webNavHandler(details);

      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });

    it('should handle excluded domains', async () => {
      const details = {
        tabId: 123,
        frameId: 0,
        url: 'https://excluded.com'
      };
      
      const settingsWithExclusion = {
        ...mockExtensionSettings,
        excludedDomains: ['excluded.com']
      };
      mockStorageManager.getSettings.mockResolvedValue(settingsWithExclusion);
      mockTimeTracker.extractDomain.mockReturnValue('excluded.com');

      await webNavHandler(details);

      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });
  });

  describe('Service State Management', () => {
    it('should track initialization state', async () => {
      expect(backgroundService.isInitialized()).toBe(false);
      
      await backgroundService.initialize();
      
      expect(backgroundService.isInitialized()).toBe(true);
    });

    it('should provide current session status', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);
      
      const session = await backgroundService.getCurrentSession();
      
      expect(session).toEqual(mockActiveSession);
      expect(mockStorageManager.getActiveSession).toHaveBeenCalled();
    });

    it('should stop current session on shutdown', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);
      mockTimeTracker.stopSession.mockResolvedValue({
        startTime: 1000,
        endTime: 2000,
        duration: 1000,
        tabId: mockActiveSession.tabId,
        windowId: mockActiveSession.windowId
      });

      await backgroundService.shutdown();

      expect(mockTimeTracker.stopSession).toHaveBeenCalled();
    });

    it('should handle shutdown with no active session', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(null);

      await backgroundService.shutdown();

      expect(mockTimeTracker.stopSession).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it('should continue operation after tab event errors', async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      mockTimeTracker.startSession.mockRejectedValue(new Error('Start session failed'));

      // Should not throw error
      await expect(tabActivatedHandler(activeInfo)).resolves.toBeUndefined();
      
      // Service should remain operational
      expect(backgroundService.isInitialized()).toBe(true);
    });

    it('should handle browser API failures gracefully', async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      browser.tabs.get.rejects(new Error('Browser API error'));
      
      await expect(tabActivatedHandler(activeInfo)).resolves.toBeUndefined();
    });

    it('should validate tab information before processing', async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const invalidTab = { id: 123, url: undefined, windowId: 1 };
      
      browser.tabs.get.resolves(invalidTab);

      await tabActivatedHandler(activeInfo);

      // Should not attempt to start session with invalid URL
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });
  });
});