/**
 * Comprehensive tests for background service and browser event integration
 */

import browser from "sinon-chrome";

import { BackgroundService } from "./background";
import { testUtils } from "../../tests/utils";

import type { DataModelManager } from "./services/DataModelManager";
import type { TimeTracker } from "./services/TimeTracker";
import type { SettingsRepository } from "./repositories/SettingsRepository";
import type { ActiveTab, ExtensionSettings } from "../../types";

describe("BackgroundService", () => {
  let backgroundService: BackgroundService;
  let mockDataModelManager: jest.Mocked<DataModelManager>;
  let mockTimeTracker: jest.Mocked<TimeTracker>;
  let mockSettingsRepository: jest.Mocked<SettingsRepository>;

  // Event handler capture variables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tabActivatedHandler: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tabUpdatedHandler: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let windowFocusHandler: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let webNavHandler: any;

  const mockActiveTab: ActiveTab = {
    domain: "example.com",
    totalTime: 5000,
    active: true,
    lastActivated: 1640995200000,
    lastTimerCheck: 1640995200000,
  };

  const mockExtensionSettings: ExtensionSettings = {
    pillPosition: { x: 100, y: 100 },
    pillVisibility: true,
    dataRetentionDays: 30,
    excludedDomains: [],
  };

  beforeEach(() => {
    testUtils.resetAll();

    // Create mock DataModelManager
    mockDataModelManager = {
      initialize: jest.fn(),
      handleTabEnter: jest.fn(),
      handleTabExit: jest.fn(),
      pauseSession: jest.fn(),
      resumeSession: jest.fn(),
      getActiveTab: jest.fn(),
      getCurrentDisplayTime: jest.fn(),
      isDomainExcluded: jest.fn(),
    } as unknown as jest.Mocked<DataModelManager>;

    // Create mock TimeTracker
    mockTimeTracker = {
      startSession: jest.fn(),
      stopSession: jest.fn(),
      pauseSession: jest.fn(),
      resumeSession: jest.fn(),
      getActiveTab: jest.fn(),
      extractDomain: jest.fn(),
      getSessionDuration: jest.fn(),
      getCurrentDisplayTime: jest.fn(),
    } as unknown as jest.Mocked<TimeTracker>;

    // Create mock SettingsRepository
    mockSettingsRepository = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
      setSettings: jest.fn(),
      getDefaultSettings: jest.fn(),
      isDomainExcluded: jest.fn(),
    } as unknown as jest.Mocked<SettingsRepository>;

    // Set up event handler capture using Jest mocks
    (
      browser.tabs.onActivated.addListener as unknown as jest.Mock
    ).mockImplementation((handler) => {
      tabActivatedHandler = handler;
    });
    (
      browser.tabs.onUpdated.addListener as unknown as jest.Mock
    ).mockImplementation((handler) => {
      tabUpdatedHandler = handler;
    });
    (
      browser.windows.onFocusChanged.addListener as unknown as jest.Mock
    ).mockImplementation((handler) => {
      windowFocusHandler = handler;
    });
    (
      browser.webNavigation.onCompleted.addListener as unknown as jest.Mock
    ).mockImplementation((handler) => {
      webNavHandler = handler;
    });

    // Reset and create BackgroundService with mocks
    BackgroundService.resetInstance();
    backgroundService = BackgroundService.getInstance(
      mockDataModelManager,
      mockTimeTracker,
      mockSettingsRepository
    );

    // Set up default mock behaviors
    mockSettingsRepository.getSettings.mockResolvedValue(mockExtensionSettings);
    mockSettingsRepository.isDomainExcluded.mockResolvedValue(false);
    mockDataModelManager.getActiveTab.mockReturnValue(null);
    mockDataModelManager.initialize.mockResolvedValue();
    mockTimeTracker.extractDomain.mockReturnValue("example.com");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = BackgroundService.getInstance();
      const instance2 = BackgroundService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should reset instance for testing", () => {
      const instance1 = BackgroundService.getInstance();
      BackgroundService.resetInstance();
      const instance2 = BackgroundService.getInstance(
        mockDataModelManager,
        mockTimeTracker,
        mockSettingsRepository
      );
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Service Initialization", () => {
    it("should initialize data model manager on startup", async () => {
      await backgroundService.initialize();

      expect(mockDataModelManager.initialize).toHaveBeenCalled();
    });

    it("should register all browser event listeners on startup", async () => {
      await backgroundService.initialize();

      // Verify tab event listeners are registered using Jest assertions
      expect(browser.tabs.onActivated.addListener).toHaveBeenCalled();
      expect(browser.tabs.onUpdated.addListener).toHaveBeenCalled();

      // Verify window event listener is registered
      expect(browser.windows.onFocusChanged.addListener).toHaveBeenCalled();

      // Verify webNavigation event listener is registered
      expect(browser.webNavigation.onCompleted.addListener).toHaveBeenCalled();
    });

    it("should handle initialization errors gracefully", async () => {
      mockDataModelManager.initialize.mockRejectedValue(
        new Error("Init failed")
      );

      await expect(backgroundService.initialize()).rejects.toThrow(
        "Failed to initialize background service: Error: Init failed"
      );
    });

    it("should not reinitialize if already initialized", async () => {
      await backgroundService.initialize();
      await backgroundService.initialize();

      // Should only be called once
      expect(mockDataModelManager.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tab Event Handling", () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it("should start tracking when tab becomes active", async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const tabInfo = {
        id: 123,
        url: "https://example.com/path",
        windowId: 1,
      };

      // Mock browser.tabs.get to return tab info
      browser.tabs.get.resolves(tabInfo);
      mockTimeTracker.startSession.mockResolvedValue(mockActiveTab);

      // Use captured event handler
      await tabActivatedHandler(activeInfo);

      // Use sinon assertions for browser API calls
      expect(browser.tabs.get.calledWith(123)).toBe(true);
      expect(mockTimeTracker.extractDomain).toHaveBeenCalledWith(
        "https://example.com/path"
      );
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith(
        "example.com",
        123,
        1
      );
    });

    it("should stop current session before starting new one", async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const tabInfo = { id: 123, url: "https://example.com", windowId: 1 };

      browser.tabs.get.resolves(tabInfo);
      mockDataModelManager.getActiveTab.mockReturnValue(mockActiveTab);
      mockTimeTracker.stopSession.mockResolvedValue();
      mockTimeTracker.startSession.mockResolvedValue(mockActiveTab);

      await tabActivatedHandler(activeInfo);

      expect(mockTimeTracker.stopSession).toHaveBeenCalled();
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith(
        "example.com",
        123,
        1
      );
    });

    it("should handle tab activation errors gracefully", async () => {
      const activeInfo = { tabId: 123, windowId: 1 };

      browser.tabs.get.rejects(new Error("Tab not found"));

      // Should not throw error
      await expect(tabActivatedHandler(activeInfo)).resolves.toBeUndefined();
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });

    it("should handle URL changes in active tab", async () => {
      const tabId = 123;
      const changeInfo = { url: "https://newsite.com" };
      const tab = {
        id: tabId,
        url: "https://newsite.com",
        windowId: 1,
        active: true,
      };

      browser.tabs.get.resolves(tab);
      mockDataModelManager.getActiveTab.mockReturnValue(mockActiveTab);
      mockTimeTracker.extractDomain.mockReturnValue("newsite.com");
      mockTimeTracker.stopSession.mockResolvedValue();
      mockTimeTracker.startSession.mockResolvedValue({
        ...mockActiveTab,
        domain: "newsite.com",
      });

      await tabUpdatedHandler(tabId, changeInfo, tab);

      expect(mockTimeTracker.stopSession).toHaveBeenCalled();
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith(
        "newsite.com",
        tabId,
        1
      );
    });

    it("should ignore URL changes in inactive tabs", async () => {
      const tabId = 123;
      const changeInfo = { url: "https://newsite.com" };
      const tab = {
        id: tabId,
        url: "https://newsite.com",
        windowId: 1,
        active: false,
      };

      browser.tabs.get.resolves(tab);

      await tabUpdatedHandler(tabId, changeInfo, tab);

      expect(mockTimeTracker.stopSession).not.toHaveBeenCalled();
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });

    it("should ignore non-URL changes", async () => {
      const tabId = 123;
      const changeInfo = { status: "loading" };
      const tab = {
        id: tabId,
        url: "https://example.com",
        windowId: 1,
        active: true,
      };

      await tabUpdatedHandler(tabId, changeInfo, tab);

      expect(mockTimeTracker.stopSession).not.toHaveBeenCalled();
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });
  });

  describe("Window Focus Handling", () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it("should pause tracking when window loses focus", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowId = (browser.windows as any).WINDOW_ID_NONE;
      mockDataModelManager.getActiveTab.mockReturnValue(mockActiveTab);
      mockTimeTracker.pauseSession.mockResolvedValue({
        ...mockActiveTab,
        active: false,
      });

      await windowFocusHandler(windowId);

      expect(mockTimeTracker.pauseSession).toHaveBeenCalled();
    });

    it("should resume tracking when window regains focus", async () => {
      const windowId = 1;
      const pausedTab = { ...mockActiveTab, active: false };
      mockDataModelManager.getActiveTab.mockReturnValue(pausedTab);
      mockTimeTracker.resumeSession.mockResolvedValue(mockActiveTab);

      await windowFocusHandler(windowId);

      expect(mockTimeTracker.resumeSession).toHaveBeenCalled();
    });

    it("should not pause if no active session", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const windowId = (browser.windows as any).WINDOW_ID_NONE;
      mockDataModelManager.getActiveTab.mockReturnValue(null);

      await windowFocusHandler(windowId);

      expect(mockTimeTracker.pauseSession).not.toHaveBeenCalled();
    });

    it("should handle window focus errors gracefully", async () => {
      const windowId = 1;
      mockDataModelManager.getActiveTab.mockImplementation(() => {
        throw new Error("Access error");
      });

      // Should not throw error
      await expect(windowFocusHandler(windowId)).resolves.toBeUndefined();
    });
  });

  describe("WebNavigation Event Handling", () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it("should start tracking on page completion for main frame", async () => {
      const details = {
        tabId: 123,
        frameId: 0, // Main frame
        url: "https://example.com/page",
      };

      const tab = {
        id: 123,
        url: "https://example.com/page",
        windowId: 1,
        active: true,
      };
      browser.tabs.get.resolves(tab);
      mockTimeTracker.extractDomain.mockReturnValue("example.com");
      mockTimeTracker.startSession.mockResolvedValue(mockActiveTab);

      await webNavHandler(details);

      expect(mockTimeTracker.extractDomain).toHaveBeenCalledWith(
        "https://example.com/page"
      );
      expect(mockTimeTracker.startSession).toHaveBeenCalledWith(
        "example.com",
        123,
        1
      );
    });

    it("should ignore subframe navigation", async () => {
      const details = {
        tabId: 123,
        frameId: 1, // Subframe
        url: "https://ads.example.com/iframe",
      };

      await webNavHandler(details);

      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });

    it("should handle excluded domains", async () => {
      const details = {
        tabId: 123,
        frameId: 0,
        url: "https://excluded.com",
      };

      const tab = {
        id: 123,
        url: "https://excluded.com",
        windowId: 1,
        active: true,
      };
      browser.tabs.get.resolves(tab);
      mockSettingsRepository.isDomainExcluded.mockResolvedValue(true);
      mockTimeTracker.extractDomain.mockReturnValue("excluded.com");

      await webNavHandler(details);

      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });
  });

  describe("Service State Management", () => {
    it("should track initialization state", async () => {
      expect(backgroundService.isInitialized()).toBe(false);

      await backgroundService.initialize();

      expect(backgroundService.isInitialized()).toBe(true);
    });

    it("should provide current active tab status", () => {
      mockDataModelManager.getActiveTab.mockReturnValue(mockActiveTab);

      const activeTab = backgroundService.getActiveTab();

      expect(activeTab).toEqual(mockActiveTab);
      expect(mockDataModelManager.getActiveTab).toHaveBeenCalled();
    });

    it("should stop current session on shutdown", async () => {
      mockDataModelManager.getActiveTab.mockReturnValue(mockActiveTab);
      mockTimeTracker.stopSession.mockResolvedValue();

      await backgroundService.shutdown();

      expect(mockTimeTracker.stopSession).toHaveBeenCalled();
    });

    it("should handle shutdown with no active session", async () => {
      mockDataModelManager.getActiveTab.mockReturnValue(null);

      await backgroundService.shutdown();

      expect(mockTimeTracker.stopSession).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling and Resilience", () => {
    beforeEach(async () => {
      await backgroundService.initialize();
    });

    it("should continue operation after tab event errors", async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const tabInfo = { id: 123, url: "https://example.com", windowId: 1 };

      browser.tabs.get.resolves(tabInfo);
      mockTimeTracker.startSession.mockRejectedValue(
        new Error("Start session failed")
      );

      // Should not throw error
      await expect(tabActivatedHandler(activeInfo)).resolves.toBeUndefined();

      // Service should remain operational
      expect(backgroundService.isInitialized()).toBe(true);
    });

    it("should handle browser API failures gracefully", async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      browser.tabs.get.rejects(new Error("Browser API error"));

      await expect(tabActivatedHandler(activeInfo)).resolves.toBeUndefined();
    });

    it("should validate tab information before processing", async () => {
      const activeInfo = { tabId: 123, windowId: 1 };
      const invalidTab = { id: 123, url: undefined, windowId: 1 };

      browser.tabs.get.resolves(invalidTab);

      await tabActivatedHandler(activeInfo);

      // Should not attempt to start session with invalid URL
      expect(mockTimeTracker.startSession).not.toHaveBeenCalled();
    });
  });
});
