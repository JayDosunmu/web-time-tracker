/**
 * Message router for content script communication with background service
 */

import type {
  ExtensionMessage,
  ExtensionMessageUnion,
  MessageHandler,
  MessageResponse,
  MessageSender,
  GetSessionStateMessage,
  ErrorReportMessage,
} from "../../../types";

export class MessageRouter implements MessageSender {
  private static listenerCount = 0;
  private static instanceCounter = 0;

  private handlers = new Map<string, MessageHandler>();
  private isInitialized = false;
  private readonly instanceId: number;
  private boundHandler: ((message: ExtensionMessageUnion, sender: browser.runtime.MessageSender, sendResponse: (response: MessageResponse) => void) => Promise<boolean>) | null = null;

  constructor() {
    this.instanceId = ++MessageRouter.instanceCounter;
    console.log(
      `[MessageRouter#${this.instanceId}] constructed | total instances created: ${MessageRouter.instanceCounter}, active listeners: ${MessageRouter.listenerCount}`,
    );
  }

  /**
   * Initialize the message router and register browser message listener
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.log(
        `[MessageRouter#${this.instanceId}] initialize() skipped — already initialized | active listeners: ${MessageRouter.listenerCount}`,
      );
      return;
    }

    // Store bound reference so we can remove it later
    this.boundHandler = this.handleMessage.bind(this) as typeof this.boundHandler;
    browser.runtime.onMessage.addListener(this.boundHandler!);
    MessageRouter.listenerCount++;
    this.isInitialized = true;

    console.log(
      `[MessageRouter#${this.instanceId}] LISTENER REGISTERED | active listeners: ${MessageRouter.listenerCount} (+1)`,
    );
  }

  /**
   * Register a message handler for a specific message type
   */
  public registerHandler<T extends ExtensionMessage>(
    messageType: string,
    handler: MessageHandler<T>,
  ): void {
    this.handlers.set(messageType, handler as MessageHandler);
  }

  /**
   * Unregister a message handler
   */
  public unregisterHandler(messageType: string): void {
    this.handlers.delete(messageType);
  }

  /**
   * Send a message to the background service
   */
  public async sendMessage<T extends ExtensionMessage>(
    message: Omit<T, "id" | "timestamp">,
  ): Promise<MessageResponse> {
    try {
      const fullMessage: ExtensionMessage = {
        ...message,
        id: this.generateMessageId(),
        timestamp: Date.now(),
      };

      const response = await browser.runtime.sendMessage(fullMessage);
      return (
        response || {
          success: false,
          error: "No response from background service",
        }
      );
    } catch (error) {
      console.error("MessageRouter.sendMessage error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Request current session state from background service
   */
  public async requestSessionState(domain: string): Promise<MessageResponse> {
    const message: Omit<GetSessionStateMessage, "id" | "timestamp"> = {
      type: "GET_SESSION_STATE",
      payload: { domain },
    };

    return this.sendMessage(message);
  }

  /**
   * Report an error to the background service
   */
  public async reportError(
    error: string,
    context: string,
    stackTrace?: string,
  ): Promise<void> {
    const message: Omit<ErrorReportMessage, "id" | "timestamp"> = {
      type: "ERROR_REPORT",
      payload: {
        error,
        context,
        ...(stackTrace && { stackTrace }),
      },
    };

    try {
      await this.sendMessage(message);
    } catch (reportError) {
      console.error(
        "Failed to report error to background service:",
        reportError,
      );
    }
  }

  /**
   * Handle incoming messages from background service
   */
  private async handleMessage(
    message: ExtensionMessageUnion,
    sender: browser.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ): Promise<boolean> {
    const receivedAt = performance.now();
    const ts = new Date().toISOString();

    try {
      // Validate message structure
      if (!this.isValidMessage(message)) {
        return true;
      }

      console.log(
        `[MessageRouter#${this.instanceId}] [${ts}] RECV type="${message.type}" | active listeners: ${MessageRouter.listenerCount}, handlers registered: ${this.handlers.size}`,
      );

      // Find and execute handler
      const handler = this.handlers.get(message.type);
      if (!handler) {
        const elapsed = (performance.now() - receivedAt).toFixed(2);
        console.warn(
          `[MessageRouter#${this.instanceId}] [${ts}] RESPOND type="${message.type}" status=no_handler elapsed=${elapsed}ms | registered types: [${[...this.handlers.keys()].join(", ")}]`,
        );
        sendResponse({
          success: false,
          error: `No handler for message type: ${message.type}`,
        });
        return true;
      }

      // Execute handler
      const result = handler(message, sender, sendResponse);

      // Handle async handlers
      if (result instanceof Promise) {
        result
          .then((response) => {
            const elapsed = (performance.now() - receivedAt).toFixed(2);
            console.log(
              `[MessageRouter#${this.instanceId}] [${ts}] RESPOND type="${message.type}" status=success elapsed=${elapsed}ms`,
            );
            sendResponse(response);
          })
          .catch((error) => {
            const elapsed = (performance.now() - receivedAt).toFixed(2);
            console.error(
              `[MessageRouter#${this.instanceId}] [${ts}] RESPOND type="${message.type}" status=error elapsed=${elapsed}ms`,
              error,
            );
            sendResponse({
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Handler execution failed",
            });
          });
        return true; // Keep message channel open for async response
      }

      // Handle sync handlers
      if (typeof result === "boolean") {
        const elapsed = (performance.now() - receivedAt).toFixed(2);
        console.log(
          `[MessageRouter#${this.instanceId}] [${ts}] RESPOND type="${message.type}" status=sync elapsed=${elapsed}ms`,
        );
        return result;
      }

      return true;
    } catch (error) {
      const elapsed = (performance.now() - receivedAt).toFixed(2);
      console.error(
        `[MessageRouter#${this.instanceId}] [${ts}] RESPOND type="${message.type}" status=exception elapsed=${elapsed}ms`,
        error,
      );
      sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : "Message handling failed",
      });
      return true;
    }
  }

  /**
   * Validate message structure
   */
  private isValidMessage(message: unknown): message is ExtensionMessageUnion {
    if (!message || typeof message !== "object") {
      return false;
    }

    const msg = message as ExtensionMessage;
    return (
      typeof msg.type === "string" &&
      typeof msg.id === "string" &&
      typeof msg.timestamp === "number" &&
      msg.payload !== undefined
    );
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `content_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Cleanup resources and unregister listeners
   */
  public destroy(): void {
    if (!this.isInitialized) {
      console.log(
        `[MessageRouter#${this.instanceId}] destroy() skipped — not initialized | active listeners: ${MessageRouter.listenerCount}`,
      );
      return;
    }

    // Clear all handlers
    this.handlers.clear();

    // Attempt to remove the listener
    if (this.boundHandler) {
      try {
        browser.runtime.onMessage.removeListener(this.boundHandler);
        MessageRouter.listenerCount--;
        console.log(
          `[MessageRouter#${this.instanceId}] LISTENER REMOVED | active listeners: ${MessageRouter.listenerCount} (-1)`,
        );
      } catch (error) {
        console.warn(
          `[MessageRouter#${this.instanceId}] removeListener failed — listener may be orphaned | active listeners: ${MessageRouter.listenerCount}`,
          error,
        );
      }
      this.boundHandler = null;
    } else {
      console.warn(
        `[MessageRouter#${this.instanceId}] destroy() called but no boundHandler reference — listener is ORPHANED and cannot be removed | active listeners: ${MessageRouter.listenerCount}`,
      );
    }

    this.isInitialized = false;
    console.log(
      `[MessageRouter#${this.instanceId}] destroyed | active listeners: ${MessageRouter.listenerCount}`,
    );
  }
}
