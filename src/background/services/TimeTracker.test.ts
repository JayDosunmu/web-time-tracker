/**
 * Comprehensive tests for TimeTracker service
 */

import { testUtils } from "../../../tests/utils";
import { TimeTracker } from "./TimeTracker";

import type { DataModelManager } from "./DataModelManager";
import type { ActiveTab } from "../../../types";

describe("TimeTracker", () => {
  let timeTracker: TimeTracker;
  let mockDataModelManager: jest.Mocked<DataModelManager>;

  const mockActiveTab: ActiveTab = {
    domain: "example.com",
    totalTime: 5000,
    active: true,
    lastActivated: 1640995200000,
    lastTimerCheck: 1640995200000,
  };

  beforeEach(() => {
    testUtils.resetAll();

    // Create mock DataModelManager
    mockDataModelManager = {
      handleTabEnter: jest.fn(),
      handleTabExit: jest.fn(),
      pauseSession: jest.fn(),
      resumeSession: jest.fn(),
      getActiveTab: jest.fn(),
      getCurrentDisplayTime: jest.fn(),
      isDomainExcluded: jest.fn(),
      initialize: jest.fn(),
    } as unknown as jest.Mocked<DataModelManager>;

    // Reset TimeTracker instance and create with mock
    TimeTracker.resetInstance();
    timeTracker = TimeTracker.getInstance(mockDataModelManager);

    // Mock performance.now() for consistent timing
    jest.spyOn(performance, "now").mockReturnValue(1000);
    jest.spyOn(Date, "now").mockReturnValue(1640995200000); // 2022-01-01 00:00:00 UTC
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = TimeTracker.getInstance();
      const instance2 = TimeTracker.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should reset instance for testing", () => {
      const instance1 = TimeTracker.getInstance();
      TimeTracker.resetInstance();
      const instance2 = TimeTracker.getInstance(mockDataModelManager);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Domain Extraction", () => {
    it("should extract domain from standard URLs", () => {
      expect(timeTracker.extractDomain("https://example.com/path")).toBe(
        "example.com"
      );
      expect(timeTracker.extractDomain("http://example.com")).toBe(
        "example.com"
      );
      expect(timeTracker.extractDomain("https://www.example.com")).toBe(
        "www.example.com"
      );
    });

    it("should handle subdomains correctly", () => {
      expect(timeTracker.extractDomain("https://blog.example.com")).toBe(
        "blog.example.com"
      );
      expect(timeTracker.extractDomain("https://api.v2.example.com")).toBe(
        "api.v2.example.com"
      );
    });

    it("should handle special cases", () => {
      expect(timeTracker.extractDomain("https://localhost:3000")).toBe(
        "localhost"
      );
      expect(timeTracker.extractDomain("https://192.168.1.1")).toBe(
        "192.168.1.1"
      );
      expect(timeTracker.extractDomain("chrome://extensions")).toBe("chrome");
    });

    it("should handle international domains", () => {
      // URL constructor converts Unicode to punycode, which is expected behavior
      expect(timeTracker.extractDomain("https://例え.テスト")).toBe(
        "xn--r8jz45g.xn--zckzah"
      );
      expect(timeTracker.extractDomain("https://xn--r8jz45g.xn--zckzah")).toBe(
        "xn--r8jz45g.xn--zckzah"
      );
    });

    it("should handle malformed URLs gracefully", () => {
      expect(timeTracker.extractDomain("not-a-url")).toBe("unknown");
      expect(timeTracker.extractDomain("")).toBe("unknown");
      expect(timeTracker.extractDomain("://missing-protocol")).toBe("unknown");
    });
  });

  describe("Session Lifecycle", () => {
    it("should start a new session successfully", async () => {
      const domain = "example.com";
      const tabId = 123;
      const windowId = 1;

      mockDataModelManager.handleTabEnter.mockResolvedValue(mockActiveTab);

      const activeTab = await timeTracker.startSession(domain, tabId, windowId);

      expect(activeTab).toEqual(mockActiveTab);
      expect(mockDataModelManager.handleTabEnter).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        domain,
        tabId,
        windowId,
      });
    });

    it("should stop current session", async () => {
      mockDataModelManager.handleTabExit.mockResolvedValue();

      await timeTracker.stopSession();

      expect(mockDataModelManager.handleTabExit).toHaveBeenCalled();
    });

    it("should pause active session", async () => {
      const pausedTab = { ...mockActiveTab, active: false };
      mockDataModelManager.pauseSession.mockResolvedValue(pausedTab);

      const result = await timeTracker.pauseSession();

      expect(result).toEqual(pausedTab);
      expect(mockDataModelManager.pauseSession).toHaveBeenCalled();
    });

    it("should resume paused session", async () => {
      mockDataModelManager.resumeSession.mockResolvedValue(mockActiveTab);

      const result = await timeTracker.resumeSession();

      expect(result).toEqual(mockActiveTab);
      expect(mockDataModelManager.resumeSession).toHaveBeenCalled();
    });

    it("should return null when pausing with no active session", async () => {
      mockDataModelManager.pauseSession.mockResolvedValue(null);

      const result = await timeTracker.pauseSession();

      expect(result).toBeNull();
    });

    it("should return null when resuming with no active session", async () => {
      mockDataModelManager.resumeSession.mockResolvedValue(null);

      const result = await timeTracker.resumeSession();

      expect(result).toBeNull();
    });
  });

  describe("Active Tab Access", () => {
    it("should get current active tab", () => {
      mockDataModelManager.getActiveTab.mockReturnValue(mockActiveTab);

      const activeTab = timeTracker.getActiveTab();

      expect(activeTab).toEqual(mockActiveTab);
      expect(mockDataModelManager.getActiveTab).toHaveBeenCalled();
    });

    it("should return null when no active tab", () => {
      mockDataModelManager.getActiveTab.mockReturnValue(null);

      const activeTab = timeTracker.getActiveTab();

      expect(activeTab).toBeNull();
    });
  });

  describe("Display Time", () => {
    it("should get current display time from DataModelManager", () => {
      mockDataModelManager.getCurrentDisplayTime.mockReturnValue(5000);

      const displayTime = timeTracker.getCurrentDisplayTime();

      expect(displayTime).toBe(5000);
      expect(mockDataModelManager.getCurrentDisplayTime).toHaveBeenCalled();
    });

    it("should get session duration for ActiveTab", () => {
      mockDataModelManager.getCurrentDisplayTime.mockReturnValue(8000);

      const duration = timeTracker.getSessionDuration(mockActiveTab);

      expect(duration).toBe(8000);
    });

    it("should handle legacy ActiveSession format", () => {
      const legacySession = {
        domain: "example.com",
        startTime: 500,
        tabId: 123,
        windowId: 1,
        isPaused: false,
      };

      jest.spyOn(performance, "now").mockReturnValue(2500);

      const duration = timeTracker.getSessionDuration(legacySession);

      // For legacy format: now() - startTime = 2500 - 500 = 2000
      expect(duration).toBe(2000);
    });
  });

  describe("Error Handling", () => {
    it("should validate domain parameter", async () => {
      await expect(timeTracker.startSession("", 123, 1)).rejects.toThrow(
        "Domain cannot be empty"
      );

      await expect(timeTracker.startSession("   ", 123, 1)).rejects.toThrow(
        "Domain cannot be empty"
      );
    });

    it("should validate tabId parameter", async () => {
      await expect(
        timeTracker.startSession("example.com", -1, 1)
      ).rejects.toThrow("TabId must be a positive number");

      await expect(
        timeTracker.startSession("example.com", NaN, 1)
      ).rejects.toThrow("TabId must be a positive number");
    });

    it("should validate windowId parameter", async () => {
      await expect(
        timeTracker.startSession("example.com", 123, -1)
      ).rejects.toThrow("WindowId must be a positive number");

      await expect(
        timeTracker.startSession("example.com", 123, NaN)
      ).rejects.toThrow("WindowId must be a positive number");
    });

    it("should handle DataModelManager errors gracefully", async () => {
      mockDataModelManager.handleTabEnter.mockRejectedValue(
        new Error("DataModel error")
      );

      await expect(
        timeTracker.startSession("example.com", 123, 1)
      ).rejects.toThrow("Failed to start session: Error: DataModel error");
    });

    it("should handle stop session errors gracefully", async () => {
      mockDataModelManager.handleTabExit.mockRejectedValue(
        new Error("Stop error")
      );

      await expect(timeTracker.stopSession()).rejects.toThrow(
        "Failed to stop session: Error: Stop error"
      );
    });
  });
});
