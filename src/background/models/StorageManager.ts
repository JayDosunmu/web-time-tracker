/**
 * Type-safe storage abstraction for browser.storage.local
 */

import type { StorageSchema, DomainData, ExtensionSettings, ActiveSession } from '../../../types';

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
        throw new Error('StorageManager must be initialized with storage parameter on first call');
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
   * Get data from storage with type safety
   */
  async get<K extends keyof StorageSchema>(
    keys: K | K[]
  ): Promise<Partial<Pick<StorageSchema, K>>> {
    try {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      const result = await this.storage.get(keyArray);
      return result as Partial<Pick<StorageSchema, K>>;
    } catch (error) {
      console.error('StorageManager.get error:', error);
      throw new Error(`Failed to get storage data: ${error}`);
    }
  }

  /**
   * Set data in storage with type safety
   */
  async set<K extends keyof StorageSchema>(
    items: Partial<Pick<StorageSchema, K>>
  ): Promise<void> {
    try {
      await this.storage.set(items);
    } catch (error) {
      console.error('StorageManager.set error:', error);
      throw new Error(`Failed to set storage data: ${error}`);
    }
  }

  /**
   * Remove data from storage
   */
  async remove(keys: keyof StorageSchema | (keyof StorageSchema)[]): Promise<void> {
    try {
      await this.storage.remove(keys as string | string[]);
    } catch (error) {
      console.error('StorageManager.remove error:', error);
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
      console.error('StorageManager.clear error:', error);
      throw new Error(`Failed to clear storage data: ${error}`);
    }
  }

  /**
   * Get complete storage schema with defaults
   */
  async getAll(): Promise<StorageSchema> {
    try {
      const data = await this.get(['domains', 'activeSession', 'settings', 'version', 'installDate']);
      
      return {
        domains: data.domains || {},
        activeSession: data.activeSession || null,
        settings: data.settings || this.getDefaultSettings(),
        version: data.version || 1,
        installDate: data.installDate || Date.now()
      };
    } catch (error) {
      console.error('StorageManager.getAll error:', error);
      throw new Error(`Failed to get all storage data: ${error}`);
    }
  }

  /**
   * Initialize storage with default values if empty
   */
  async initialize(): Promise<void> {
    try {
      const existing = await this.get(['version', 'installDate', 'settings']);
      
      const updates: Partial<StorageSchema> = {};
      
      if (!existing.version) {
        updates.version = 1;
      }
      
      if (!existing.installDate) {
        updates.installDate = Date.now();
      }
      
      if (!existing.settings) {
        updates.settings = this.getDefaultSettings();
      }
      
      if (Object.keys(updates).length > 0) {
        await this.set(updates);
      }
    } catch (error) {
      console.error('StorageManager.initialize error:', error);
      throw new Error(`Failed to initialize storage: ${error}`);
    }
  }

  /**
   * Get domain data with fallback to empty structure
   */
  async getDomainData(domain: string): Promise<DomainData> {
    try {
      const { domains } = await this.get(['domains']);
      return domains?.[domain] || this.createEmptyDomainData();
    } catch (error) {
      console.error('StorageManager.getDomainData error:', error);
      return this.createEmptyDomainData();
    }
  }

  /**
   * Update domain data atomically
   */
  async updateDomainData(domain: string, updates: Partial<DomainData>): Promise<void> {
    try {
      const { domains } = await this.get(['domains']);
      const currentDomains = domains || {};
      const currentDomainData = currentDomains[domain] || this.createEmptyDomainData();
      
      const updatedDomainData: DomainData = {
        ...currentDomainData,
        ...updates,
        lastAccessed: Date.now()
      };
      
      await this.set({
        domains: {
          ...currentDomains,
          [domain]: updatedDomainData
        }
      });
    } catch (error) {
      console.error('StorageManager.updateDomainData error:', error);
      throw new Error(`Failed to update domain data for ${domain}: ${error}`);
    }
  }

  /**
   * Get active session
   */
  async getActiveSession(): Promise<ActiveSession | null> {
    try {
      const { activeSession } = await this.get(['activeSession']);
      return activeSession || null;
    } catch (error) {
      console.error('StorageManager.getActiveSession error:', error);
      return null;
    }
  }

  /**
   * Set active session
   */
  async setActiveSession(session: ActiveSession | null): Promise<void> {
    try {
      await this.set({ activeSession: session });
    } catch (error) {
      console.error('StorageManager.setActiveSession error:', error);
      throw new Error(`Failed to set active session: ${error}`);
    }
  }

  /**
   * Get extension settings
   */
  async getSettings(): Promise<ExtensionSettings> {
    try {
      const { settings } = await this.get(['settings']);
      return settings || this.getDefaultSettings();
    } catch (error) {
      console.error('StorageManager.getSettings error:', error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Update extension settings
   */
  async updateSettings(updates: Partial<ExtensionSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings: ExtensionSettings = {
        ...currentSettings,
        ...updates
      };
      
      await this.set({ settings: updatedSettings });
    } catch (error) {
      console.error('StorageManager.updateSettings error:', error);
      throw new Error(`Failed to update settings: ${error}`);
    }
  }

  /**
   * Create empty domain data structure
   */
  private createEmptyDomainData(): DomainData {
    return {
      totalTime: 0,
      sessions: [],
      dailyStats: {},
      lastAccessed: Date.now()
    };
  }

  /**
   * Get default extension settings
   */
  private getDefaultSettings(): ExtensionSettings {
    return {
      pillPosition: 'top-right',
      pillVisibility: true,
      dataRetentionDays: 30,
      excludedDomains: []
    };
  }
}