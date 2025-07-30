/**
 * Core test utilities for storage, messaging, and timers
 */

import type { StorageSchema } from '../types/storage';
import type { ExtensionMessage } from '../types/messages';

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
 * Test utilities for message handling
 */
export class MockMessageUtils {
  private messageHandlers = new Map<string, Function>();
  private sentMessages: ExtensionMessage[] = [];

  addListener(handler: (message: ExtensionMessage, sender: any) => void): void {
    this.messageHandlers.set('default', handler);
  }

  removeListener(handler: Function): void {
    this.messageHandlers.delete('default');
  }

  async sendMessage(message: ExtensionMessage): Promise<ExtensionMessage | void> {
    this.sentMessages.push(message);
    
    const handler = this.messageHandlers.get('default');
    if (handler) {
      return handler(message, { tab: { id: 1 } });
    }
  }

  getSentMessages(): ExtensionMessage[] {
    return [...this.sentMessages];
  }

  getLastMessage(): ExtensionMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  clearMessages(): void {
    this.sentMessages = [];
  }

  reset(): void {
    this.messageHandlers.clear();
    this.sentMessages = [];
  }
}

/**
 * Test utilities for timer mocking
 */
export class MockTimerUtils {
  private currentTime = 1640995200000; // 2022-01-01 00:00:00 UTC
  private timers = new Map<number, { callback: Function; delay: number; interval?: boolean }>();
  private nextId = 1;

  now(): number {
    return this.currentTime;
  }

  advanceTime(ms: number): void {
    this.currentTime += ms;
    
    // Trigger any timers that should have fired
    for (const [id, timer] of this.timers.entries()) {
      if (this.currentTime >= timer.delay) {
        timer.callback();
        if (!timer.interval) {
          this.timers.delete(id);
        }
      }
    }
  }

  setTimeout(callback: Function, delay: number): number {
    const id = this.nextId++;
    this.timers.set(id, { callback, delay: this.currentTime + delay });
    return id;
  }

  setInterval(callback: Function, delay: number): number {
    const id = this.nextId++;
    this.timers.set(id, { callback, delay: this.currentTime + delay, interval: true });
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  clearInterval(id: number): void {
    this.timers.delete(id);
  }

  reset(): void {
    this.timers.clear();
    this.currentTime = 1640995200000;
    this.nextId = 1;
  }
}

/**
 * Global test utilities instance
 */
export const testUtils = {
  storage: new MockStorageUtils(),
  messaging: new MockMessageUtils(),
  timers: new MockTimerUtils(),
  
  resetAll(): void {
    this.storage.reset();
    this.messaging.reset();
    this.timers.reset();
  }
};