/**
 * @jest-environment-options {"url": "https://example.com/page"}
 */

/**
 * Tests for ContentScriptManager content script orchestration
 */

import { testUtils } from "../../tests/utils";
import { ContentScriptManager } from "./ContentScriptManager";
import { MessageRouter } from "./messaging/MessageRouter";
import { TimeDisplayPill, TimeDisplayPillFactory } from "./components/TimeDisplayPill";
import { ComponentRegistry } from "./lifecycle/ComponentRegistry";
import { SettingsRepository, TabRepository, HistoryRepository } from "../shared/repositories";
import type { RefreshStateMessage, HourTimesAggregate, Hours24Tuple } from "../../types";

// Helper to create empty hourTimes fixture for tests
const createEmptyHourTimes = (): HourTimesAggregate => ({
  hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as Hours24Tuple,
});

// Mock dependencies
jest.mock("./messaging/MessageRouter");
jest.mock("./components/TimeDisplayPill");
jest.mock("../shared/repositories");

describe("ContentScriptManager", () => {
  let contentManager: ContentScriptManager;
  let mockMessageRouter: jest.Mocked<MessageRouter>;
  let mockTimeDisplayPill: jest.Mocked<TimeDisplayPill>;
  let mockSettingsRepository: jest.Mocked<SettingsRepository>;
  let mockTabRepository: jest.Mocked<TabRepository>;
  let mockHistoryRepository: jest.Mocked<HistoryRepository>;

  const mockSettings = {
    pillPosition: { x: 100, y: 100 },
    pillVisibility: true,
    pillShowFullInfo: false,
    pillHidden: false,
    dataRetentionDays: 30,
    excludedDomains: [],
  };

  const mockActiveTab = {
    domain: "example.com",
    totalTime: 5000,
    active: true,
    lastActivated: 1000,
    lastTimerCheck: 1000,
  };

  const mockDayData = {
    totalTime: 15000,
    hours: [],
    domains: {
      "example.com": {
        totalTime: 5000,
        visitCount: 3,
        lastVisited: 1000,
        lastTimerCheck: 1000,
      },
    },
    timestamp: Date.now(),
    shiftedHours: {},
  };

  beforeEach(() => {
    testUtils.resetAll();

    // Create mock instances
    mockMessageRouter = {
      initialize: jest.fn(),
      registerHandler: jest.fn(),
      unregisterHandler: jest.fn(),
      sendMessage: jest.fn(),
      requestSessionState: jest.fn(),
      reportError: jest.fn(),
      destroy: jest.fn(),
    } as any;

    mockTimeDisplayPill = {
      onSessionUpdate: jest.fn(),
      onSettingsChange: jest.fn(),
      setPositionChangeCallback: jest.fn(),
      setShowFullInfoChangeCallback: jest.fn(),
      setHiddenChangeCallback: jest.fn(),
      destroy: jest.fn(),
    } as any;

    mockSettingsRepository = {
      getSettings: jest.fn().mockResolvedValue(mockSettings),
      updateSettings: jest.fn().mockResolvedValue(undefined),
      isDomainExcluded: jest.fn().mockResolvedValue(false),
    } as any;

    mockTabRepository = {
      getActiveTab: jest.fn().mockResolvedValue(mockActiveTab),
      setActiveTab: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockHistoryRepository = {
      getDay: jest.fn().mockResolvedValue(mockDayData),
      getHistory: jest.fn().mockResolvedValue({ earliest: 0, latest: 0, days: {} }),
      setDay: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Mock constructors
    (MessageRouter as jest.Mock).mockImplementation(() => mockMessageRouter);
    (TimeDisplayPill as jest.Mock).mockImplementation(
      () => mockTimeDisplayPill,
    );
    // Mock the factory to use the mocked pill
    (TimeDisplayPillFactory as jest.Mocked<typeof TimeDisplayPillFactory>).create = jest.fn().mockResolvedValue(mockTimeDisplayPill);
    (TimeDisplayPillFactory as any).selector = '#web-time-tracker-pill';
    (SettingsRepository.getInstance as jest.Mock).mockReturnValue(
      mockSettingsRepository,
    );
    (TabRepository.getInstance as jest.Mock).mockReturnValue(
      mockTabRepository,
    );
    (HistoryRepository.getInstance as jest.Mock).mockReturnValue(
      mockHistoryRepository,
    );

    // Reset singleton instances
    SettingsRepository.resetInstance();
    TabRepository.resetInstance();
    HistoryRepository.resetInstance();
    ComponentRegistry.resetInstance();
    ContentScriptManager.resetInstance();
    contentManager = ContentScriptManager.getInstance();
  });

  afterEach(() => {
    if (contentManager) {
      contentManager.destroy();
    }
    ContentScriptManager.resetInstance();
    ComponentRegistry.resetInstance();
    jest.restoreAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = ContentScriptManager.getInstance();
      const instance2 = ContentScriptManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance properly", () => {
      const instance1 = ContentScriptManager.getInstance();
      ContentScriptManager.resetInstance();
      const instance2 = ContentScriptManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Initialization", () => {
    it("should initialize successfully", async () => {
      await contentManager.initialize();

      expect(contentManager.isReady()).toBe(true);
      expect(mockMessageRouter.initialize).toHaveBeenCalled();
      // Only one handler now (REFRESH_STATE)
      expect(mockMessageRouter.registerHandler).toHaveBeenCalledTimes(1);
      // Should read from storage via repositories
      expect(mockSettingsRepository.getSettings).toHaveBeenCalled();
      expect(mockTabRepository.getActiveTab).toHaveBeenCalled();
    });

    it("should not reinitialize if already initialized", async () => {
      await contentManager.initialize();
      await contentManager.initialize();

      expect(mockMessageRouter.initialize).toHaveBeenCalledTimes(1);
    });

    it("should handle initialization errors", async () => {
      mockMessageRouter.initialize.mockImplementation(() => {
        throw new Error("Initialization failed");
      });

      await expect(contentManager.initialize()).rejects.toThrow(
        "Initialization failed",
      );
      expect(mockMessageRouter.reportError).toHaveBeenCalled();
    });

    it("should wait for DOM ready when loading", async () => {
      Object.defineProperty(document, "readyState", {
        value: "loading",
      });

      const initPromise = contentManager.initialize();

      // Simulate DOMContentLoaded
      setTimeout(() => {
        document.dispatchEvent(new Event("DOMContentLoaded"));
      }, 10);

      await initPromise;
      expect(contentManager.isReady()).toBe(true);
    });
  });

  describe("Domain Management", () => {
    beforeEach(async () => {
      await contentManager.initialize();
    });

    it("should extract domain correctly", () => {
      expect(contentManager.getDomain()).toBe("example.com");
    });

    it("should handle URL changes", async () => {
      // Reset mock call counts after initialization
      mockTabRepository.getActiveTab.mockClear();
      mockSettingsRepository.getSettings.mockClear();

      contentManager.handleUrlChange("https://newdomain.com/page");

      expect(contentManager.getDomain()).toBe("newdomain.com");
      // Should read state from storage for new domain
      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockTabRepository.getActiveTab).toHaveBeenCalled();
    });

    it("should ignore URL changes within same domain", async () => {
      // Reset mock call counts after initialization
      mockTabRepository.getActiveTab.mockClear();

      contentManager.handleUrlChange("https://example.com/different-page");

      expect(contentManager.getDomain()).toBe("example.com");
      // Should not trigger new storage reads for same domain
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockTabRepository.getActiveTab).not.toHaveBeenCalled();
    });

    it("should handle invalid URLs gracefully", () => {
      contentManager.handleUrlChange("invalid-url");
      expect(contentManager.getDomain()).toBe("unknown");
    });
  });

  describe("Component Management", () => {
    beforeEach(async () => {
      await contentManager.initialize();
    });

    it("should register components during initialization", () => {
      const timeDisplayPill = contentManager.getComponent("timeDisplayPill");
      expect(timeDisplayPill).toBe(mockTimeDisplayPill);
    });

    it("should register and unregister components", () => {
      const mockComponent = { destroy: jest.fn() };

      contentManager.registerComponent("testComponent", mockComponent);
      expect(contentManager.getComponent("testComponent")).toBe(mockComponent);

      contentManager.unregisterComponent("testComponent");
      expect(contentManager.getComponent("testComponent")).toBe(null);
      expect(mockComponent.destroy).toHaveBeenCalled();
    });

    it("should handle components without destroy method", () => {
      const mockComponent = {};

      contentManager.registerComponent("testComponent", mockComponent);
      expect(() =>
        contentManager.unregisterComponent("testComponent"),
      ).not.toThrow();
    });

    it("should return null for non-existent components", () => {
      expect(contentManager.getComponent("nonExistent")).toBe(null);
    });
  });

  describe("Message Handling", () => {
    let refreshStateHandler: (message: any) => Promise<any>;

    beforeEach(async () => {
      await contentManager.initialize();

      // Get the registered REFRESH_STATE handler
      const registerCalls = mockMessageRouter.registerHandler.mock.calls;
      const refreshCall = registerCalls.find(
        (call) => call[0] === "REFRESH_STATE",
      );
      const rawHandler = refreshCall![1];
      // Wrap handler to call with mock sender and sendResponse for testing
      const mockSender = {} as browser.runtime.MessageSender;
      const mockSendResponse = jest.fn();
      refreshStateHandler = (message: any) =>
        Promise.resolve(rawHandler(message, mockSender, mockSendResponse)).then(
          (result) => (typeof result === "boolean" ? { success: result } : result),
        );
    });

    it("should register REFRESH_STATE message handler", () => {
      expect(mockMessageRouter.registerHandler).toHaveBeenCalledWith(
        "REFRESH_STATE",
        expect.any(Function),
      );
    });

    it("should handle REFRESH_STATE messages by reading from storage", async () => {
      // Clear previous calls from initialization
      mockSettingsRepository.getSettings.mockClear();
      mockTabRepository.getActiveTab.mockClear();
      mockTimeDisplayPill.onSessionUpdate.mockClear();
      mockTimeDisplayPill.onSettingsChange.mockClear();

      const refreshMessage: RefreshStateMessage = {
        type: "REFRESH_STATE",
        payload: { reason: "tab_activated" },
        id: "test-id",
        timestamp: Date.now(),
      };

      const result = await refreshStateHandler(refreshMessage);

      expect(result.success).toBe(true);
      // Should read from storage
      expect(mockSettingsRepository.getSettings).toHaveBeenCalled();
      expect(mockTabRepository.getActiveTab).toHaveBeenCalled();
      // Should update components
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalled();
      expect(mockTimeDisplayPill.onSettingsChange).toHaveBeenCalled();
    });

    it("should handle REFRESH_STATE when active tab domain differs", async () => {
      // Set up active tab with different domain
      mockTabRepository.getActiveTab.mockResolvedValue({
        domain: "different.com",
        totalTime: 1000,
        active: true,
        lastActivated: 1000,
        lastTimerCheck: 1000,
      });

      mockTimeDisplayPill.onSessionUpdate.mockClear();

      const refreshMessage: RefreshStateMessage = {
        type: "REFRESH_STATE",
        payload: { reason: "navigation" },
        id: "test-id",
        timestamp: Date.now(),
      };

      await refreshStateHandler(refreshMessage);

      // Should call onSessionUpdate with null when domains don't match
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(null);
    });
  });

  describe("Initial State Request", () => {
    it("should read initial state from storage successfully", async () => {
      await contentManager.initialize();

      // Should read from repositories
      expect(mockSettingsRepository.getSettings).toHaveBeenCalled();
      expect(mockTabRepository.getActiveTab).toHaveBeenCalled();
      // Should update pill with session state
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith({
        domain: "example.com",
        baseCurrentTime: 5000,
        baseTotalTimeToday: 15000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: 1000,
        hourTimes: createEmptyHourTimes(),
      });
    });

    it("should handle no active session", async () => {
      mockTabRepository.getActiveTab.mockResolvedValue(null);

      await contentManager.initialize();

      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(null);
    });

    it("should handle storage read errors gracefully", async () => {
      mockTabRepository.getActiveTab.mockRejectedValue(
        new Error("Storage error"),
      );

      // Should not throw - errors are caught internally
      await contentManager.initialize();

      expect(contentManager.isReady()).toBe(true);
    });
  });

  describe("Error Handling", () => {
    beforeEach(async () => {
      await contentManager.initialize();
    });

    it("should handle component broadcast errors gracefully", async () => {
      const brokenComponent = {
        onSessionUpdate: jest.fn().mockImplementation(() => {
          throw new Error("Component broken");
        }),
      };

      contentManager.registerComponent("brokenComponent", brokenComponent);

      // Trigger a broadcast via REFRESH_STATE
      const registerCalls = mockMessageRouter.registerHandler.mock.calls;
      const refreshCall = registerCalls.find(
        (call) => call[0] === "REFRESH_STATE",
      );
      expect(refreshCall).toBeDefined();
      const rawHandler = refreshCall![1];

      const refreshMessage: RefreshStateMessage = {
        type: "REFRESH_STATE",
        payload: { reason: "tab_activated" },
        id: "test-id",
        timestamp: Date.now(),
      };

      // Should not throw despite component error
      const mockSender = {} as browser.runtime.MessageSender;
      const mockSendResponse = jest.fn();
      await expect(
        Promise.resolve(rawHandler(refreshMessage, mockSender, mockSendResponse)),
      ).resolves.not.toThrow();
    });
  });

  describe("Cleanup", () => {
    it("should destroy properly when initialized", async () => {
      await contentManager.initialize();

      contentManager.destroy();

      expect(mockTimeDisplayPill.destroy).toHaveBeenCalled();
      expect(mockMessageRouter.destroy).toHaveBeenCalled();
      expect(contentManager.isReady()).toBe(false);
    });

    it("should handle destroy when not initialized", () => {
      expect(() => contentManager.destroy()).not.toThrow();
    });

    it("should handle component destroy errors", async () => {
      await contentManager.initialize();

      mockTimeDisplayPill.destroy.mockImplementation(() => {
        throw new Error("Destroy failed");
      });

      expect(() => contentManager.destroy()).not.toThrow();
    });
  });

  describe("Message Router Access", () => {
    it("should provide access to message router", () => {
      expect(contentManager.getMessageRouter()).toBe(mockMessageRouter);
    });
  });

  describe("Settings loaded on tab initialization", () => {
    it("should read settings from storage during initialization", async () => {
      await contentManager.initialize();

      // Verify settings were read from repository
      expect(mockSettingsRepository.getSettings).toHaveBeenCalled();

      // Verify pill was created
      const pill = contentManager.getComponent("timeDisplayPill");
      expect(pill).toBeDefined();
    });

    it("should apply settings to pill when loaded successfully", async () => {
      const customSettings = {
        pillPosition: { x: 250, y: 100 },
        pillVisibility: false,
        pillShowFullInfo: false,
        pillHidden: false,
        dataRetentionDays: 30,
        excludedDomains: [],
      };

      mockSettingsRepository.getSettings.mockResolvedValue(customSettings);

      await contentManager.initialize();

      // Verify onSettingsChange was called on the pill with visibility
      expect(mockTimeDisplayPill.onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ pillVisibility: false })
      );
    });

    it("should handle storage read errors gracefully", async () => {
      mockSettingsRepository.getSettings.mockRejectedValue(
        new Error("Storage error")
      );

      // Should not throw - errors are caught internally
      await expect(contentManager.initialize()).rejects.toThrow();
    });

    it("should pass initial position to TimeDisplayPill from storage", async () => {
      const customSettings = {
        pillPosition: { x: 300, y: 150 },
        pillVisibility: true,
        pillShowFullInfo: false,
        pillHidden: false,
        dataRetentionDays: 30,
        excludedDomains: [],
      };

      mockSettingsRepository.getSettings.mockResolvedValue(customSettings);

      await contentManager.initialize();

      // Verify TimeDisplayPillFactory.create was called with settings from storage
      expect(TimeDisplayPillFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { x: 300, y: 150 },
          showFullInfo: false,
          hidden: false,
        })
      );
    });
  });

  describe("Storage-based state loading", () => {
    it("should read both settings and active tab on initialization", async () => {
      await contentManager.initialize();

      expect(mockSettingsRepository.getSettings).toHaveBeenCalled();
      expect(mockTabRepository.getActiveTab).toHaveBeenCalled();
    });

    it("should build session state from active tab when domains match", async () => {
      await contentManager.initialize();

      // Should build and pass session state to pill
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith({
        domain: "example.com",
        baseCurrentTime: 5000,
        baseTotalTimeToday: 15000,
        visitCount: 3,
        isActive: true,
        isPaused: false,
        startTime: 1000,
        hourTimes: createEmptyHourTimes(),
      });
    });

    it("should pass null session state when no active tab", async () => {
      mockTabRepository.getActiveTab.mockResolvedValue(null);

      await contentManager.initialize();

      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(null);
    });
  });

  describe("Hidden State Persistence", () => {
    it("should pass initial pillHidden to TimeDisplayPillFactory", async () => {
      const settingsWithHidden = {
        ...mockSettings,
        pillHidden: true,
      };
      mockSettingsRepository.getSettings.mockResolvedValue(settingsWithHidden);

      await contentManager.initialize();

      // Verify TimeDisplayPillFactory.create was called with pillHidden from storage
      expect(TimeDisplayPillFactory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hidden: true,
        })
      );
    });

    it("should wire up setHiddenChangeCallback on pill", async () => {
      await contentManager.initialize();

      expect(mockTimeDisplayPill.setHiddenChangeCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it("should send UPDATE_PILL_HIDDEN message when hidden changes", async () => {
      mockMessageRouter.sendMessage.mockResolvedValue({ success: true });
      await contentManager.initialize();

      // Get the callback that was registered
      const hiddenChangeCallback =
        mockTimeDisplayPill.setHiddenChangeCallback.mock.calls[0][0];

      // Simulate hidden change
      await hiddenChangeCallback(true);

      expect(mockMessageRouter.sendMessage).toHaveBeenCalledWith({
        type: "UPDATE_PILL_HIDDEN",
        payload: { hidden: true },
      });
    });

    it("should handle UPDATE_PILL_HIDDEN message failure gracefully", async () => {
      mockMessageRouter.sendMessage.mockResolvedValue({
        success: false,
        error: "Storage error",
      });
      await contentManager.initialize();

      // Get the callback that was registered
      const hiddenChangeCallback =
        mockTimeDisplayPill.setHiddenChangeCallback.mock.calls[0][0];

      // Should not throw despite error response
      expect(() => hiddenChangeCallback(true)).not.toThrow();
    });

    it("should broadcast pillHidden in onSettingsChange on REFRESH_STATE", async () => {
      const settingsWithHidden = {
        ...mockSettings,
        pillHidden: true,
      };
      mockSettingsRepository.getSettings.mockResolvedValue(settingsWithHidden);
      await contentManager.initialize();

      // Clear previous calls from initialization
      mockTimeDisplayPill.onSettingsChange.mockClear();

      // Trigger REFRESH_STATE handler
      const registerCalls = mockMessageRouter.registerHandler.mock.calls;
      const refreshCall = registerCalls.find(
        (call) => call[0] === "REFRESH_STATE"
      );
      const rawHandler = refreshCall![1];
      const mockSender = {} as browser.runtime.MessageSender;
      const mockSendResponse = jest.fn();

      const refreshMessage: RefreshStateMessage = {
        type: "REFRESH_STATE",
        payload: { reason: "settings_changed" },
        id: "test-id",
        timestamp: Date.now(),
      };

      await rawHandler(refreshMessage, mockSender, mockSendResponse);

      // Verify pillHidden is included in broadcast
      expect(mockTimeDisplayPill.onSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ pillHidden: true })
      );
    });
  });
});
