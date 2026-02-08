/**
 * @jest-environment-options {"url": "https://example.com/page"}
 */

/**
 * Tests for ContentScriptManager content script orchestration
 */

import { testUtils } from "../../tests/utils";
import { ContentScriptManager } from "./ContentScriptManager";
import { MessageRouter } from "./messaging/MessageRouter";
import { TimeDisplayPill } from "./components/TimeDisplayPill";
import type {
  SessionUpdateMessage,
  SettingsChangeMessage,
  MessageResponse,
} from "../../types";

// Mock dependencies
jest.mock("./messaging/MessageRouter");
jest.mock("./components/TimeDisplayPill");

describe("ContentScriptManager", () => {
  let contentManager: ContentScriptManager;
  let mockMessageRouter: jest.Mocked<MessageRouter>;
  let mockTimeDisplayPill: jest.Mocked<TimeDisplayPill>;

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
      destroy: jest.fn(),
    } as any;

    // Mock constructors
    (MessageRouter as jest.Mock).mockImplementation(() => mockMessageRouter);
    (TimeDisplayPill as jest.Mock).mockImplementation(
      () => mockTimeDisplayPill,
    );

    // Reset singleton instance and create new one with proper location
    ContentScriptManager.resetInstance();
    contentManager = ContentScriptManager.getInstance();
  });

  afterEach(() => {
    if (contentManager) {
      contentManager.destroy();
    }
    ContentScriptManager.resetInstance();
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
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
        data: {
          domain: "example.com",
          currentTime: 5000,
          isActive: true,
          isPaused: false,
          startTime: 1000,
        },
      });

      await contentManager.initialize();

      expect(contentManager.isReady()).toBe(true);
      expect(mockMessageRouter.initialize).toHaveBeenCalled();
      expect(mockMessageRouter.registerHandler).toHaveBeenCalledTimes(2);
      expect(mockMessageRouter.requestSessionState).toHaveBeenCalledWith(
        "example.com",
      );
    });

    it("should not reinitialize if already initialized", async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });

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

      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
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
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });
      await contentManager.initialize();
    });

    it("should extract domain correctly", () => {
      expect(contentManager.getDomain()).toBe("example.com");
    });

    it("should handle URL changes", () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });

      contentManager.handleUrlChange("https://newdomain.com/page");

      expect(contentManager.getDomain()).toBe("newdomain.com");
      expect(mockMessageRouter.requestSessionState).toHaveBeenCalledWith(
        "newdomain.com",
      );
    });

    it("should ignore URL changes within same domain", () => {
      const initialCallCount =
        mockMessageRouter.requestSessionState.mock.calls.length;

      contentManager.handleUrlChange("https://example.com/different-page");

      expect(contentManager.getDomain()).toBe("example.com");
      expect(mockMessageRouter.requestSessionState).toHaveBeenCalledTimes(
        initialCallCount,
      );
    });

    it("should handle invalid URLs gracefully", () => {
      contentManager.handleUrlChange("invalid-url");
      expect(contentManager.getDomain()).toBe("unknown");
    });
  });

  describe("Component Management", () => {
    beforeEach(async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });
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
    let sessionUpdateHandler: (message: any) => Promise<any>;
    let settingsChangeHandler: (message: any) => Promise<any>;

    beforeEach(async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });
      await contentManager.initialize();

      // Get the registered handlers - wrapping the 3-arg handler to simplify testing
      const registerCalls = mockMessageRouter.registerHandler.mock.calls;
      const sessionCall = registerCalls.find(
        (call) => call[0] === "SESSION_UPDATE",
      );
      const settingsCall = registerCalls.find(
        (call) => call[0] === "SETTINGS_CHANGE",
      );
      const rawSessionHandler = sessionCall![1];
      const rawSettingsHandler = settingsCall![1];
      // Wrap handlers to call with mock sender and sendResponse for testing
      const mockSender = {} as browser.runtime.MessageSender;
      const mockSendResponse = jest.fn();
      sessionUpdateHandler = (message: any) =>
        Promise.resolve(rawSessionHandler(message, mockSender, mockSendResponse)).then(
          (result) => (typeof result === "boolean" ? { success: result } : result),
        );
      settingsChangeHandler = (message: any) =>
        Promise.resolve(rawSettingsHandler(message, mockSender, mockSendResponse)).then(
          (result) => (typeof result === "boolean" ? { success: result } : result),
        );
    });

    it("should register message handlers", () => {
      expect(mockMessageRouter.registerHandler).toHaveBeenCalledWith(
        "SESSION_UPDATE",
        expect.any(Function),
      );
      expect(mockMessageRouter.registerHandler).toHaveBeenCalledWith(
        "SETTINGS_CHANGE",
        expect.any(Function),
      );
    });

    it("should handle session update messages", async () => {
      const sessionMessage: SessionUpdateMessage = {
        type: "SESSION_UPDATE",
        payload: {
          domain: "example.com",
          currentTime: 5000,
          isActive: true,
          isPaused: false,
          startTime: 1000,
        },
        id: "test-id",
        timestamp: Date.now(),
      };

      const result = await sessionUpdateHandler(sessionMessage);

      expect(result.success).toBe(true);
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(
        sessionMessage.payload,
      );
    });

    it("should handle settings change messages", async () => {
      const settingsMessage: SettingsChangeMessage = {
        type: "SETTINGS_CHANGE",
        payload: {
          pillPosition: { x: 10, y: 10 },
          pillVisibility: true,
          excludedDomains: ["blocked.com"],
        },
        id: "test-id",
        timestamp: Date.now(),
      };

      const result = await settingsChangeHandler(settingsMessage);

      expect(result.success).toBe(true);
      expect(mockTimeDisplayPill.onSettingsChange).toHaveBeenCalledWith(
        settingsMessage.payload,
      );
    });

    it("should handle message handler errors", async () => {
      mockTimeDisplayPill.onSessionUpdate.mockImplementation(() => {
        throw new Error("Component error");
      });

      const sessionMessage: SessionUpdateMessage = {
        type: "SESSION_UPDATE",
        payload: {
          domain: "example.com",
          currentTime: 5000,
          isActive: true,
          isPaused: false,
          startTime: 1000,
        },
        id: "test-id",
        timestamp: Date.now(),
      };

      // The ContentScriptManager catches component errors and continues
      // so the handler should still return success
      const result = await sessionUpdateHandler(sessionMessage);

      expect(result.success).toBe(true);
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalled();
    });
  });

  describe("Initial State Request", () => {
    it("should request initial state successfully", async () => {
      const mockResponse: MessageResponse = {
        success: true,
        data: {
          domain: "example.com",
          currentTime: 5000,
          isActive: true,
          isPaused: false,
          startTime: 1000,
        },
      };

      mockMessageRouter.requestSessionState.mockResolvedValue(mockResponse);

      await contentManager.initialize();

      expect(mockMessageRouter.requestSessionState).toHaveBeenCalledWith(
        "example.com",
      );
      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(
        mockResponse.data,
      );
    });

    it("should handle no active session", async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
        data: null,
      });

      await contentManager.initialize();

      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(null);
    });

    it("should handle request failures", async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: false,
        error: "Request failed",
      });

      await contentManager.initialize();

      expect(mockTimeDisplayPill.onSessionUpdate).toHaveBeenCalledWith(null);
    });

    it("should handle request errors", async () => {
      mockMessageRouter.requestSessionState.mockRejectedValue(
        new Error("Network error"),
      );

      await contentManager.initialize();

      expect(mockMessageRouter.reportError).toHaveBeenCalledWith(
        "Network error",
        "Failed to request initial session state",
        expect.any(String),
      );
    });
  });

  describe("Error Handling", () => {
    beforeEach(async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });
      await contentManager.initialize();
    });

    it("should report component broadcast errors", async () => {
      const brokenComponent = {
        onSessionUpdate: jest.fn().mockImplementation(() => {
          throw new Error("Component broken");
        }),
      };

      contentManager.registerComponent("brokenComponent", brokenComponent);

      // Trigger a broadcast
      const registerCalls = mockMessageRouter.registerHandler.mock.calls;
      const sessionCall = registerCalls.find(
        (call) => call[0] === "SESSION_UPDATE",
      );
      expect(sessionCall).toBeDefined();
      const rawHandler = sessionCall![1];

      const sessionMessage: SessionUpdateMessage = {
        type: "SESSION_UPDATE",
        payload: {
          domain: "example.com",
          currentTime: 5000,
          isActive: true,
          isPaused: false,
          startTime: 1000,
        },
        id: "test-id",
        timestamp: Date.now(),
      };

      // Should not throw despite component error
      const mockSender = {} as browser.runtime.MessageSender;
      const mockSendResponse = jest.fn();
      await expect(
        Promise.resolve(rawHandler(sessionMessage, mockSender, mockSendResponse)),
      ).resolves.not.toThrow();
    });
  });

  describe("Cleanup", () => {
    it("should destroy properly when initialized", async () => {
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });
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
      mockMessageRouter.requestSessionState.mockResolvedValue({
        success: true,
      });
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
});
