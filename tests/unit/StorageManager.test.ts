/**
 * Comprehensive tests for StorageManager
 */

import { StorageManager } from '../../src/background/models/StorageManager';
import { testUtils } from '../utils';
import { 
  mockStorageSchema, 
  mockDomainData, 
  mockActiveSession, 
  mockExtensionSettings
} from '../fixtures';

describe('StorageManager', () => {
  let storageManager: StorageManager;

  // Because the StorageManager is a singleton, and reset before each test,
  // the tests can't run concurrently.
  beforeEach(() => {
    testUtils.resetAll();
    StorageManager.resetInstance();
    storageManager = StorageManager.getInstance(browser.storage.local);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = StorageManager.getInstance();
      const instance2 = StorageManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Basic Storage Operations', () => {
    it('should set data with type safety', async () => {
      const testData = { domains: mockStorageSchema.domains };
      
      // Call StorageManager.set()
      await storageManager.set(testData);
      
      // State assertion: verify the stateful storage contains the data
      const storedData = await browser.storage.local.get(['domains']);
      expect(storedData.domains).toEqual(mockStorageSchema.domains);
    });

    it('should get data with type safety', async () => {
      await browser.storage.local.set({ domains: mockStorageSchema.domains });
      
      const result = await storageManager.get(['domains']);
      
      expect(result.domains).toEqual(mockStorageSchema.domains);
    });

    it('should get multiple keys', async () => {
      await browser.storage.local.set({ 
        domains: mockStorageSchema.domains,
        version: mockStorageSchema.version 
      });
      
      const result = await storageManager.get(['domains', 'version']);
      
      expect(result.domains).toEqual(mockStorageSchema.domains);
      expect(result.version).toBe(mockStorageSchema.version);
    });


    it('should remove data', async () => {
      await browser.storage.local.set({ domains: mockStorageSchema.domains });
      
      await storageManager.remove(['domains']);
      
      const result = await browser.storage.local.get(['domains']);
      expect(result.domains).toBeUndefined();
    });

    it('should clear all data', async () => {
      await browser.storage.local.set({ domains: mockStorageSchema.domains, version: 1 });
      
      await storageManager.clear();
      
      const result = await browser.storage.local.get();
      expect(result).toEqual({});
    });

    it('should handle storage errors gracefully', async () => {
      // Replace the stateful mock with an error-throwing mock for this test
      (browser.storage.local.get as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      await expect(storageManager.get(['domains'])).rejects.toThrow('Failed to get storage data');
    });
  });

  describe('Complete Schema Operations', () => {
    it('should get complete schema with defaults', async () => {
      const result = await storageManager.getAll();
      
      expect(result).toEqual({
        domains: {},
        activeSession: null,
        settings: {
          pillPosition: 'top-right',
          pillVisibility: true,
          dataRetentionDays: 30,
          excludedDomains: []
        },
        version: 1,
        installDate: expect.any(Number)
      });
    });

    it('should get existing schema data', async () => {
      await browser.storage.local.set(mockStorageSchema);
      
      const result = await storageManager.getAll();
      
      expect(result).toEqual(mockStorageSchema);
    });

    it('should initialize storage with defaults', async () => {
      await storageManager.initialize();
      
      const result = await browser.storage.local.get(['version', 'installDate', 'settings']);
      
      expect(result.version).toBe(1);
      expect(result.installDate).toEqual(expect.any(Number));
      expect(result.settings).toEqual({
        pillPosition: 'top-right',
        pillVisibility: true,
        dataRetentionDays: 30,
        excludedDomains: []
      });
    });

    it('should not overwrite existing data during initialization', async () => {
      const existingData = {
        version: 2,
        installDate: 1640995200000,
        settings: mockExtensionSettings
      };
      await browser.storage.local.set(existingData);
      
      await storageManager.initialize();
      
      const result = await browser.storage.local.get(['version', 'installDate', 'settings']);
      expect(result).toEqual(existingData);
    });
  });

  describe('Domain Data Operations', () => {
    it('should get existing domain data', async () => {
      await browser.storage.local.set({ domains: { 'example.com': mockDomainData } });
      
      const result = await storageManager.getDomainData('example.com');
      
      expect(result).toEqual(mockDomainData);
    });

    it('should return empty domain data for non-existent domain', async () => {
      const result = await storageManager.getDomainData('nonexistent.com');
      
      expect(result).toEqual({
        totalTime: 0,
        sessions: [],
        dailyStats: {},
        lastAccessed: expect.any(Number)
      });
    });

    it('should update domain data atomically', async () => {
      const initialDomains = { 'example.com': mockDomainData };
      await browser.storage.local.set({ domains: initialDomains });
      
      const updates = { totalTime: 7200000 };
      await storageManager.updateDomainData('example.com', updates);
      
      const result = await browser.storage.local.get(['domains']);
      expect(result.domains!['example.com'].totalTime).toBe(7200000);
      expect(result.domains!['example.com'].lastAccessed).toEqual(expect.any(Number));
    });

    it('should create new domain data when updating non-existent domain', async () => {
      const updates = { totalTime: 3600000 };
      
      await storageManager.updateDomainData('newdomain.com', updates);
      
      const result = await browser.storage.local.get(['domains']);
      expect(result.domains!['newdomain.com']).toEqual({
        totalTime: 3600000,
        sessions: [],
        dailyStats: {},
        lastAccessed: expect.any(Number)
      });
    });

    it('should handle domain data errors gracefully', async () => {
      (browser.storage.local.get as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      const result = await storageManager.getDomainData('example.com');
      
      expect(result).toEqual({
        totalTime: 0,
        sessions: [],
        dailyStats: {},
        lastAccessed: expect.any(Number)
      });
    });
  });

  describe('Active Session Operations', () => {
    it('should get active session', async () => {
      await browser.storage.local.set({ activeSession: mockActiveSession });
      
      const result = await storageManager.getActiveSession();
      
      expect(result).toEqual(mockActiveSession);
    });

    it('should return null for no active session', async () => {
      const result = await storageManager.getActiveSession();
      
      expect(result).toBeNull();
    });

    it('should set active session', async () => {
      await storageManager.setActiveSession(mockActiveSession);
      
      const result = await browser.storage.local.get(['activeSession']);
      expect(result.activeSession).toEqual(mockActiveSession);
    });

    it('should set active session to null', async () => {
      await browser.storage.local.set({ activeSession: mockActiveSession });
      
      await storageManager.setActiveSession(null);
      
      const result = await browser.storage.local.get(['activeSession']);
      expect(result.activeSession).toBeNull();
    });

    it('should handle active session errors gracefully', async () => {
      (browser.storage.local.get as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      const result = await storageManager.getActiveSession();
      
      expect(result).toBeNull();
    });
  });

  describe('Settings Operations', () => {
    it('should get existing settings', async () => {
      await browser.storage.local.set({ settings: mockExtensionSettings });
      
      const result = await storageManager.getSettings();
      
      expect(result).toEqual(mockExtensionSettings);
    });

    it('should return default settings when none exist', async () => {
      const result = await storageManager.getSettings();
      
      expect(result).toEqual({
        pillPosition: 'top-right',
        pillVisibility: true,
        dataRetentionDays: 30,
        excludedDomains: []
      });
    });

    it('should update settings partially', async () => {
      await browser.storage.local.set({ settings: mockExtensionSettings });
      
      const updates = { pillPosition: 'bottom-left' as const };
      await storageManager.updateSettings(updates);
      
      const result = await browser.storage.local.get(['settings']);
      expect(result.settings).toEqual({
        ...mockExtensionSettings,
        pillPosition: 'bottom-left'
      });
    });

    it('should update settings on fresh installation', async () => {
      const updates = { dataRetentionDays: 60 };
      
      await storageManager.updateSettings(updates);
      
      const result = await browser.storage.local.get(['settings']);
      expect(result.settings).toEqual({
        pillPosition: 'top-right',
        pillVisibility: true,
        dataRetentionDays: 60,
        excludedDomains: []
      });
    });

    it('should handle settings errors gracefully', async () => {
      (browser.storage.local.get as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      const result = await storageManager.getSettings();
      
      expect(result).toEqual({
        pillPosition: 'top-right',
        pillVisibility: true,
        dataRetentionDays: 30,
        excludedDomains: []
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle set operation errors', async () => {
      (browser.storage.local.set as any).callsFake(async () => {
        throw new Error('Storage full');
      });
      
      await expect(storageManager.set({ version: 2 })).rejects.toThrow('Failed to set storage data');
    });

    it('should handle remove operation errors', async () => {
      (browser.storage.local.remove as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      await expect(storageManager.remove(['domains'])).rejects.toThrow('Failed to remove storage data');
    });

    it('should handle clear operation errors', async () => {
      (browser.storage.local.clear as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      await expect(storageManager.clear()).rejects.toThrow('Failed to clear storage data');
    });

    it('should handle updateDomainData errors', async () => {
      (browser.storage.local.set as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      await expect(storageManager.updateDomainData('example.com', { totalTime: 1000 }))
        .rejects.toThrow('Failed to update domain data for example.com');
    });

    it('should handle setActiveSession errors', async () => {
      (browser.storage.local.set as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      await expect(storageManager.setActiveSession(mockActiveSession))
        .rejects.toThrow('Failed to set active session');
    });

    it('should handle updateSettings errors', async () => {
      (browser.storage.local.set as any).callsFake(async () => {
        throw new Error('Storage error');
      });
      
      await expect(storageManager.updateSettings({ pillVisibility: false }))
        .rejects.toThrow('Failed to update settings');
    });
  });
});