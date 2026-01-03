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
  ErrorReportMessage
} from '../../../types';

export class MessageRouter implements MessageSender {
  private handlers = new Map<string, MessageHandler>();
  private isInitialized = false;

  /**
   * Initialize the message router and register browser message listener
   */
  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Register browser runtime message listener
    browser.runtime.onMessage.addListener(this.handleMessage.bind(this));
    this.isInitialized = true;

    console.log('MessageRouter initialized for content script');
  }

  /**
   * Register a message handler for a specific message type
   */
  public registerHandler<T extends ExtensionMessage>(
    messageType: string,
    handler: MessageHandler<T>
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
    message: Omit<T, 'id' | 'timestamp'>
  ): Promise<MessageResponse> {
    try {
      const fullMessage: ExtensionMessage = {
        ...message,
        id: this.generateMessageId(),
        timestamp: Date.now()
      };

      const response = await browser.runtime.sendMessage(fullMessage);
      return response || { success: false, error: 'No response from background service' };
    } catch (error) {
      console.error('MessageRouter.sendMessage error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Request current session state from background service
   */
  public async requestSessionState(domain: string): Promise<MessageResponse> {
    const message: Omit<GetSessionStateMessage, 'id' | 'timestamp'> = {
      type: 'GET_SESSION_STATE',
      payload: { domain }
    };

    return this.sendMessage(message);
  }

  /**
   * Report an error to the background service
   */
  public async reportError(error: string, context: string, stackTrace?: string): Promise<void> {
    const message: Omit<ErrorReportMessage, 'id' | 'timestamp'> = {
      type: 'ERROR_REPORT',
      payload: {
        error,
        context,
        ...(stackTrace && { stackTrace })
      }
    };

    try {
      await this.sendMessage(message);
    } catch (reportError) {
      console.error('Failed to report error to background service:', reportError);
    }
  }

  /**
   * Handle incoming messages from background service
   */
  private async handleMessage(
    message: ExtensionMessageUnion,
    sender: browser.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): Promise<boolean> {
    try {
      // Validate message structure
      if (!this.isValidMessage(message)) {
        console.warn('MessageRouter received invalid message:', message);
        sendResponse({ success: false, error: 'Invalid message format' });
        return true;
      }

      // Find and execute handler
      const handler = this.handlers.get(message.type);
      if (!handler) {
        console.warn(`MessageRouter: No handler registered for message type: ${message.type}`);
        sendResponse({ success: false, error: `No handler for message type: ${message.type}` });
        return true;
      }

      // Execute handler
      const result = handler(message, sender, sendResponse);
      
      // Handle async handlers
      if (result instanceof Promise) {
        result
          .then(response => sendResponse(response))
          .catch(error => {
            console.error(`MessageRouter handler error for ${message.type}:`, error);
            sendResponse({
              success: false,
              error: error instanceof Error ? error.message : 'Handler execution failed'
            });
          });
        return true; // Keep message channel open for async response
      }

      // Handle sync handlers
      if (typeof result === 'boolean') {
        return result;
      }

      return true;
    } catch (error) {
      console.error('MessageRouter.handleMessage error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Message handling failed'
      });
      return true;
    }
  }

  /**
   * Validate message structure
   */
  private isValidMessage(message: unknown): message is ExtensionMessageUnion {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const msg = message as ExtensionMessage;
    return (
      typeof msg.type === 'string' &&
      typeof msg.id === 'string' &&
      typeof msg.timestamp === 'number' &&
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
      return;
    }

    // Clear all handlers
    this.handlers.clear();
    
    // Note: browser.runtime.onMessage.removeListener is not reliable
    // The listener will be cleaned up when the content script is destroyed
    
    this.isInitialized = false;
    console.log('MessageRouter destroyed');
  }
}