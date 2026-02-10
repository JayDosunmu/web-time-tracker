/**
 * StorageManager - Pure generic CRUD abstraction for browser.storage.local
 *
 * This class provides a thin wrapper around browser.storage with type-safe
 * generic operations. All domain-specific logic should be handled by
 * repositories (HistoryRepository, TabRepository, SettingsRepository).
 */

type StorageArea = browser.storage.StorageArea;

export class StorageManager {
  private static instance: StorageManager | null = null;
  private storage: StorageArea;

  private constructor(storage: StorageArea) {
    this.storage = storage;
  }

  public static getInstance(storage?: StorageArea): StorageManager {
    if (!StorageManager.instance) {
      if (!storage) {
        throw new Error(
          "StorageManager must be initialized with storage parameter on first call"
        );
      }
      StorageManager.instance = new StorageManager(storage);
    }
    return StorageManager.instance;
  }

  /**
   * Reset singleton instance for testing
   */
  public static resetInstance(): void {
    StorageManager.instance = null;
  }

  /**
   * Get the underlying storage area (for repositories to use directly)
   */
  getStorage(): StorageArea {
    return this.storage;
  }

  /**
   * Get data from storage by key(s)
   */
  async get<T = unknown>(keys: string | string[]): Promise<Record<string, T>> {
    try {
      const result = await this.storage.get(keys);
      return result as Record<string, T>;
    } catch (error) {
      console.error("StorageManager.get error:", error);
      throw new Error(`Failed to get storage data: ${error}`);
    }
  }

  /**
   * Set data in storage
   */
  async set(items: Record<string, unknown>): Promise<void> {
    try {
      await this.storage.set(items);
    } catch (error) {
      console.error("StorageManager.set error:", error);
      throw new Error(`Failed to set storage data: ${error}`);
    }
  }

  /**
   * Remove data from storage by key(s)
   */
  async remove(keys: string | string[]): Promise<void> {
    try {
      await this.storage.remove(keys);
    } catch (error) {
      console.error("StorageManager.remove error:", error);
      throw new Error(`Failed to remove storage data: ${error}`);
    }
  }

  /**
   * Clear all storage data
   */
  async clear(): Promise<void> {
    try {
      await this.storage.clear();
    } catch (error) {
      console.error("StorageManager.clear error:", error);
      throw new Error(`Failed to clear storage data: ${error}`);
    }
  }

  /**
   * Get all data from storage
   */
  async getAll<T = unknown>(): Promise<Record<string, T>> {
    try {
      const result = await this.storage.get(null);
      return result as Record<string, T>;
    } catch (error) {
      console.error("StorageManager.getAll error:", error);
      throw new Error(`Failed to get all storage data: ${error}`);
    }
  }
}
