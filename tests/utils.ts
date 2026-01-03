/**
 * Core test utilities for storage, messaging, and timers
 */

/**
 * Test utilities for mocking storage operations
 * Implements StorageArea interface for API compatibility
 */
export class MockStorageUtils {
  private storage = new Map<string, any>();

  // StorageArea interface methods
  async get(keys?: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }> {
    if (keys === null || keys === undefined) {
      // Return all data
      return Object.fromEntries(this.storage.entries());
    }
    
    const keyArray = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const result: { [key: string]: any } = {};
    
    for (const key of keyArray) {
      if (this.storage.has(key)) {
        result[key] = this.storage.get(key);
      }
    }
    
    return result;
  }

  async set(items: { [key: string]: any }): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      this.storage.set(key, value);
    }
  }

  async remove(keys: string | string[]): Promise<void> {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    for (const key of keyArray) {
      this.storage.delete(key);
    }
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  // Additional utility methods for testing
  getAll(): Record<string, any> {
    return Object.fromEntries(this.storage.entries());
  }

  reset(): void {
    this.storage.clear();
  }
}

/**
 * Mock browser runtime for content script testing
 */
export class MockBrowserRuntime {
  private messageListeners: Array<(message: any, sender: any, sendResponse: any) => void> = [];
  
  public sendMessage = jest.fn();
  
  public onMessage = {
    addListener: jest.fn((listener: any) => {
      this.messageListeners.push(listener);
    }),
    removeListener: jest.fn(),
    hasListener: jest.fn()
  };

  public reset(): void {
    this.messageListeners = [];
    this.sendMessage.mockReset();
    this.onMessage.addListener.mockReset();
    this.onMessage.removeListener.mockReset();
    this.onMessage.hasListener.mockReset();
  }

  public triggerMessage(message: any, sender: any = {}, sendResponse: any = jest.fn()): void {
    this.messageListeners.forEach(listener => {
      try {
        listener(message, sender, sendResponse);
      } catch (error) {
        console.error('Mock message listener error:', error);
      }
    });
  }
}

/**
 * Global test utilities instance
 */
export const testUtils = {
  storage: new MockStorageUtils(),
  browserRuntime: new MockBrowserRuntime(),
  
  resetAll(): void {
    this.storage.reset();
    this.browserRuntime.reset();
    
    // Setup browser global mocks
    this.setupBrowserMocks();
    
    // Reset DOM mocks
    this.resetDOMMocks();
  },

  setupBrowserMocks(): void {
    // Mock browser.runtime with proper property descriptors
    if (!global.browser) {
      global.browser = {} as any;
    }
    
    Object.defineProperty(global.browser, 'runtime', {
      value: this.browserRuntime,
      writable: true,
      configurable: true
    });
  },

  resetDOMMocks(): void {
    // Force update window.location values
    try {
      // Update existing location object
      if (window.location) {
        Object.defineProperty(window.location, 'href', {
          value: 'https://example.com/page',
          writable: true,
          configurable: true
        });
        Object.defineProperty(window.location, 'hostname', {
          value: 'example.com',
          writable: true,
          configurable: true
        });
      }
    } catch (error) {
      // If that fails, try to replace the entire location object
      try {
        delete (window as any).location;
        Object.defineProperty(window, 'location', {
          value: {
            href: 'https://example.com/page',
            hostname: 'example.com'
          },
          writable: true,
          configurable: true
        });
      } catch (replaceError) {
        console.warn('Could not mock window.location:', replaceError);
      }
    }

    // Reset document.readyState
    try {
      Object.defineProperty(document, 'readyState', {
        value: 'complete',
        writable: true,
        configurable: true
      });
    } catch (error) {
      // Already defined, ignore
    }

    // Mock requestAnimationFrame
    global.requestAnimationFrame = jest.fn((callback) => {
      setTimeout(callback, 16);
      return 1;
    });

    global.cancelAnimationFrame = jest.fn();
  },

  _locationMocked: false
};