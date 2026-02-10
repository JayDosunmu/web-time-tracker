/**
 * Content script manager with singleton pattern and component lifecycle management
 */

import type { SessionUpdateMessage, SettingsChangeMessage, ExtensionSettings, PillPosition } from "../../types";
import { MessageRouter } from "./messaging/MessageRouter";
import { TimeDisplayPill } from "./components/TimeDisplayPill";

export class ContentScriptManager {
  private static instance: ContentScriptManager | null = null;
  private messageRouter: MessageRouter;
  private isInitialized = false;
  private currentDomain: string;
  private components = new Map<string, any>();
  private visibilityHandler: (() => void) | null = null;

  private constructor() {
    this.messageRouter = new MessageRouter();
    this.currentDomain = this.extractDomain(window.location.href);
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
      // Request settings before creating components to get saved position
      const settings = await this.requestSettings();
      const initialPosition = settings?.pillPosition;

      // Create and register TimeDisplayPill with initial position
      const timeDisplayPill = new TimeDisplayPill(initialPosition);

      // Wire up position change callback for persistence
      timeDisplayPill.setPositionChangeCallback(this.handlePositionChange.bind(this));

      this.registerComponent("timeDisplayPill", timeDisplayPill);

      // Apply visibility setting if available
      if (settings && typeof settings.pillVisibility === "boolean") {
        timeDisplayPill.onSettingsChange({
          pillVisibility: settings.pillVisibility,
        });
      }

      console.log("Components initialized successfully");
    } catch (error) {
      console.error("ContentScriptManager.initializeComponents error:", error);
      throw error;
    }
  }

  /**
   * Register message handlers
   */
  private registerMessageHandlers(): void {
    // Handle session updates from background
    this.messageRouter.registerHandler<SessionUpdateMessage>(
      "SESSION_UPDATE",
      async (message) => {
        try {
          console.log(
            "ContentScriptManager received session update:",
            message.payload,
          );

          // Broadcast to all registered components
          this.broadcastToComponents("onSessionUpdate", message.payload);

          // Pull fresh settings on tab activation to sync pill position
          const settings = await this.requestSettings();
          if (settings) {
            this.broadcastToComponents("onSettingsChange", settings);
          }

          return { success: true };
        } catch (error) {
          console.error(
            "ContentScriptManager.handleSessionUpdate error:",
            error,
          );
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Session update handling failed",
          };
        }
      },
    );

    // Handle settings changes from background
    this.messageRouter.registerHandler<SettingsChangeMessage>(
      "SETTINGS_CHANGE",
      async (message) => {
        try {
          console.log(
            "ContentScriptManager received settings change:",
            message.payload,
          );

          // Broadcast to all registered components
          this.broadcastToComponents("onSettingsChange", message.payload);

          return { success: true };
        } catch (error) {
          console.error(
            "ContentScriptManager.handleSettingsChange error:",
            error,
          );
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : "Settings change handling failed",
          };
        }
      },
    );
  }

  /**
   * Request initial session state from background service with retry logic
   */
  private async requestInitialState(): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 100; // milliseconds
    let lastError: unknown = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(
          `Requesting session state for domain: ${this.currentDomain} (attempt ${attempt + 1}/${maxRetries})`,
        );
        const response = await this.messageRouter.requestSessionState(
          this.currentDomain,
        );

        if (response.success) {
          // Success - broadcast state to components (may be null if no active session)
          this.broadcastToComponents("onSessionUpdate", response.data || null);
          return;
        }

        // Check if error indicates background not ready
        const errorMsg = response.error || "";
        if (
          errorMsg.includes("No response") ||
          errorMsg.includes("Could not establish connection") ||
          errorMsg.includes("receiving end does not exist")
        ) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`Background not ready, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Other error - don't retry
        console.warn("Failed to get session state:", response.error);
        this.broadcastToComponents("onSessionUpdate", null);
        return;
      } catch (error) {
        lastError = error;
        const delay = baseDelay * Math.pow(2, attempt);
        console.error(`Request failed (attempt ${attempt + 1}):`, error);

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted - report the error
    console.warn(
      "Could not establish connection to background service after retries",
    );

    if (lastError) {
      await this.reportError("Failed to request initial session state", lastError);
    }

    this.broadcastToComponents("onSessionUpdate", null);
  }

  /**
   * Request settings from background service
   */
  private async requestSettings(): Promise<ExtensionSettings | null> {
    try {
      const response = await this.messageRouter.sendMessage({
        type: "GET_SETTINGS",
        payload: {},
      });

      if (response.success && response.data) {
        return response.data as ExtensionSettings;
      }
      return null;
    } catch (error) {
      console.error("Failed to request settings:", error);
      return null;
    }
  }

  /**
   * Handle position changes from TimeDisplayPill drag
   */
  private async handlePositionChange(position: PillPosition): Promise<void> {
    try {
      // Validate position before saving
      if (!position ||
          typeof position.x !== 'number' ||
          typeof position.y !== 'number' ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y)) {
        console.error('Invalid pill position, not saving:', position);
        return;
      }

      const response = await this.messageRouter.sendMessage({
        type: "UPDATE_PILL_POSITION",
        payload: { position },
      });

      if (!response.success) {
        console.error("Failed to save pill position:", response.error || 'No response from background');
      }
    } catch (error) {
      console.error("Error saving pill position:", error);
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
      if (document.visibilityState === 'visible') {
        console.log('Tab became visible, requesting fresh session state');
        this.requestInitialState().catch((error) => {
          console.error('Failed to request session state on visibility change:', error);
        });
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
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
   * TODO: this looks like a duplicate of the one in StorageManager.ts
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
    if (!this.isInitialized) {
      return;
    }

    try {
      // Remove visibility change listener
      if (this.visibilityHandler) {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
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
