/**
 * Tests for MessageRouter content script messaging
 */

import { testUtils } from '../../../tests/utils';
import { MessageRouter } from './MessageRouter';
import type {
  RefreshStateMessage,
  MessageResponse
} from '../../../types';

describe('MessageRouter', () => {
  let messageRouter: MessageRouter;
  let mockSendMessage: jest.Mock;

  beforeEach(() => {
    testUtils.resetAll();

    // Get the mocked sendMessage function
    mockSendMessage = testUtils.browserRuntime.sendMessage;

    // Create message router instance
    messageRouter = new MessageRouter();
  });

  afterEach(() => {
    if (messageRouter) {
      messageRouter.destroy();
    }
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      messageRouter.initialize();

      // Verify message listener was registered
      expect(browser.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', () => {
      messageRouter.initialize();
      messageRouter.initialize();

      // Should only register listener once
      expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Sending', () => {
    beforeEach(() => {
      messageRouter.initialize();
    });

    it('should send message successfully', async () => {
      const mockResponse: MessageResponse = { success: true };
      mockSendMessage.mockResolvedValue(mockResponse);

      const message = {
        type: 'GET_SESSION_STATE' as const,
        payload: { domain: 'example.com' }
      };

      const response = await messageRouter.sendMessage(message);

      expect(mockSendMessage).toHaveBeenCalledWith({
        ...message,
        id: expect.any(String),
        timestamp: expect.any(Number)
      });
      expect(response).toEqual(mockResponse);
    });

    it('should handle sendMessage errors gracefully', async () => {
      mockSendMessage.mockRejectedValue(new Error('Connection failed'));

      const message = {
        type: 'GET_SESSION_STATE' as const,
        payload: { domain: 'example.com' }
      };

      const response = await messageRouter.sendMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Connection failed');
    });

    it('should handle missing response', async () => {
      mockSendMessage.mockResolvedValue(undefined);

      const message = {
        type: 'GET_SESSION_STATE' as const,
        payload: { domain: 'example.com' }
      };

      const response = await messageRouter.sendMessage(message);

      expect(response.success).toBe(false);
      expect(response.error).toBe('No response from background service');
    });
  });

  describe('Session State Requests', () => {
    beforeEach(() => {
      messageRouter.initialize();
    });

    it('should request session state correctly', async () => {
      const mockResponse: MessageResponse = {
        success: true,
        data: { domain: 'example.com', currentTime: 5000, isActive: true }
      };
      mockSendMessage.mockResolvedValue(mockResponse);

      const response = await messageRouter.requestSessionState('example.com');

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'GET_SESSION_STATE',
        payload: { domain: 'example.com' },
        id: expect.any(String),
        timestamp: expect.any(Number)
      });
      expect(response).toEqual(mockResponse);
    });
  });

  describe('Error Reporting', () => {
    beforeEach(() => {
      messageRouter.initialize();
    });

    it('should report error with stack trace', async () => {
      const mockResponse: MessageResponse = { success: true };
      mockSendMessage.mockResolvedValue(mockResponse);

      await messageRouter.reportError('Test error', 'test context', 'stack trace');

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'ERROR_REPORT',
        payload: {
          error: 'Test error',
          context: 'test context',
          stackTrace: 'stack trace'
        },
        id: expect.any(String),
        timestamp: expect.any(Number)
      });
    });

    it('should report error without stack trace', async () => {
      const mockResponse: MessageResponse = { success: true };
      mockSendMessage.mockResolvedValue(mockResponse);

      await messageRouter.reportError('Test error', 'test context');

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'ERROR_REPORT',
        payload: {
          error: 'Test error',
          context: 'test context'
        },
        id: expect.any(String),
        timestamp: expect.any(Number)
      });
    });

    it('should handle error reporting failures gracefully', async () => {
      mockSendMessage.mockRejectedValue(new Error('Send failed'));

      // Should not throw error
      await expect(messageRouter.reportError('Test error', 'test context')).resolves.toBeUndefined();
    });
  });

  describe('Message Handler Registration', () => {
    beforeEach(() => {
      messageRouter.initialize();
    });

    it('should register message handler', () => {
      const handler = jest.fn();

      messageRouter.registerHandler('SESSION_UPDATE', handler);

      // Handler should be registered (no direct way to test, but no error should occur)
      expect(() => messageRouter.registerHandler('SESSION_UPDATE', handler)).not.toThrow();
    });

    it('should unregister message handler', () => {
      const handler = jest.fn();

      messageRouter.registerHandler('SESSION_UPDATE', handler);
      messageRouter.unregisterHandler('SESSION_UPDATE');

      // Handler should be unregistered (no direct way to test, but no error should occur)
      expect(() => messageRouter.unregisterHandler('SESSION_UPDATE')).not.toThrow();
    });
  });

  describe('Message Handling', () => {
    let mockHandler1: jest.Mock;

    beforeEach(() => {
      messageRouter.initialize();
      mockHandler1 = jest.fn();
    });

    it('should call registered handler for refresh state', async () => {
      mockHandler1.mockResolvedValue({ success: true });
      messageRouter.registerHandler<RefreshStateMessage>('REFRESH_STATE', mockHandler1);

      const message: RefreshStateMessage = {
        type: 'REFRESH_STATE',
        payload: {
          reason: 'tab_activated'
        },
        id: 'test-id',
        timestamp: Date.now()
      };

      // Simulate message received
      const messageListener = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      const mockSendResponse = jest.fn();
      const result = await messageListener(message, {}, mockSendResponse);

      expect(mockHandler1).toHaveBeenCalledWith(message, {}, mockSendResponse);
      expect(result).toBe(true);
    });

    it('should silently drop invalid message format without responding', async () => {
      // Responding to invalid messages from a stale router instance would
      // clobber the real router's response when multiple listeners coexist
      const invalidMessage = { invalid: 'message' };
      const mockSendResponse = jest.fn();

      const messageListener = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      const result = await messageListener(invalidMessage, {}, mockSendResponse);

      expect(mockSendResponse).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle unregistered message type', async () => {
      const message = {
        type: 'UNKNOWN_TYPE',
        payload: {},
        id: 'test-id',
        timestamp: Date.now()
      };
      const mockSendResponse = jest.fn();

      const messageListener = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      const result = await messageListener(message, {}, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No handler for message type: UNKNOWN_TYPE'
      });
      expect(result).toBe(true);
    });

    it('should handle async handler', async () => {
      mockHandler1.mockResolvedValue({ success: true, data: 'test' });
      messageRouter.registerHandler('SESSION_UPDATE', mockHandler1);

      const message = {
        type: 'SESSION_UPDATE',
        payload: {},
        id: 'test-id',
        timestamp: Date.now()
      };
      const mockSendResponse = jest.fn();

      const messageListener = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      const result = await messageListener(message, {}, mockSendResponse);

      expect(result).toBe(true);
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true, data: 'test' });
    });

    it('should handle handler errors', async () => {
      mockHandler1.mockRejectedValue(new Error('Handler failed'));
      messageRouter.registerHandler('SESSION_UPDATE', mockHandler1);

      const message = {
        type: 'SESSION_UPDATE',
        payload: {},
        id: 'test-id',
        timestamp: Date.now()
      };
      const mockSendResponse = jest.fn();

      const messageListener = (browser.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      const result = await messageListener(message, {}, mockSendResponse);

      expect(result).toBe(true);
      // Wait for async handler to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Handler failed'
      });
    });
  });

  describe('Message ID Generation', () => {
    beforeEach(() => {
      messageRouter.initialize();
    });

    it('should generate unique message IDs', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      const message1 = { type: 'GET_SESSION_STATE' as const, payload: { domain: 'test1.com' } };
      const message2 = { type: 'GET_SESSION_STATE' as const, payload: { domain: 'test2.com' } };

      await messageRouter.sendMessage(message1);
      await messageRouter.sendMessage(message2);

      const call1 = mockSendMessage.mock.calls[0][0];
      const call2 = mockSendMessage.mock.calls[1][0];

      expect(call1.id).not.toEqual(call2.id);
      expect(call1.id).toMatch(/^content_\d+_[a-z0-9]+$/);
      expect(call2.id).toMatch(/^content_\d+_[a-z0-9]+$/);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup properly', () => {
      messageRouter.initialize();

      expect(() => messageRouter.destroy()).not.toThrow();
    });

    it('should handle cleanup when not initialized', () => {
      expect(() => messageRouter.destroy()).not.toThrow();
    });
  });
});
