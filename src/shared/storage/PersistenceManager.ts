/**
 * PersistenceManager - Pure generic CRUD abstraction for browser.storage.local
 *
 * This class provides a thin wrapper around browser.storage with type-safe
 * generic operations. All domain-specific logic should be handled by
 * repositories (HistoryRepository, TabRepository, SettingsRepository).
 */

type StorageArea = browser.storage.StorageArea;

export class PersistenceManager {
  private static instance: PersistenceManager | null = null;
  private storage: StorageArea;

  private constructor(storage: StorageArea) {
    this.storage = storage;
  }

  public static getInstance(storage?: StorageArea): PersistenceManager {
    if (!PersistenceManager.instance) {
      if (!storage) {
        throw new Error(
          "PersistenceManager must be initialized with storage parameter on first call"
        );
      }
      PersistenceManager.instance = new PersistenceManager(storage);
    }
    return PersistenceManager.instance;
  }

  /**
   * Reset singleton instance for testing
   */
  public static resetInstance(): void {
    PersistenceManager.instance = null;
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
      console.error("PersistenceManager.get error:", error);
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
      console.error("PersistenceManager.set error:", error);
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
      console.error("PersistenceManager.remove error:", error);
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
      console.error("PersistenceManager.clear error:", error);
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
      console.error("PersistenceManager.getAll error:", error);
      throw new Error(`Failed to get all storage data: ${error}`);
    }
  }
}
