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
 * Global test utilities instance
 */
export const testUtils = {
  storage: new MockStorageUtils(),
  
  resetAll(): void {
    this.storage.reset();
  }
};