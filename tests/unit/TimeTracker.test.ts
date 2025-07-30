/**
 * Comprehensive tests for TimeTracker service
 */

import { TimeTracker } from '../../src/background/services/TimeTracker';
import type { StorageManager } from '../../src/background/models/StorageManager';
import { testUtils } from '../utils';
import { mockActiveSession, mockExtensionSettings } from '../fixtures';

describe('TimeTracker', () => {
  let timeTracker: TimeTracker;
  let mockStorageManager: jest.Mocked<StorageManager>;

  beforeEach(() => {
    testUtils.resetAll();
    
    // Create mock StorageManager with required methods for TimeTracker
    mockStorageManager = {
      getActiveSession: jest.fn(),
      setActiveSession: jest.fn(),
      getDomainData: jest.fn(),
      updateDomainData: jest.fn(),
      getSettings: jest.fn()
    } as unknown as jest.Mocked<StorageManager>;

    // Reset TimeTracker instance and create with mock storage
    TimeTracker.resetInstance();
    timeTracker = TimeTracker.getInstance(mockStorageManager);

    // Mock performance.now() for consistent timing
    jest.spyOn(performance, 'now').mockReturnValue(1000);
    jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00 UTC
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = TimeTracker.getInstance();
      const instance2 = TimeTracker.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should reset instance for testing', () => {
      const instance1 = TimeTracker.getInstance();
      TimeTracker.resetInstance();
      const instance2 = TimeTracker.getInstance(mockStorageManager);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Domain Extraction', () => {
    it('should extract domain from standard URLs', () => {
      expect(timeTracker.extractDomain('https://example.com/path')).toBe('example.com');
      expect(timeTracker.extractDomain('http://example.com')).toBe('example.com');
      expect(timeTracker.extractDomain('https://www.example.com')).toBe('www.example.com');
    });

    it('should handle subdomains correctly', () => {
      expect(timeTracker.extractDomain('https://blog.example.com')).toBe('blog.example.com');
      expect(timeTracker.extractDomain('https://api.v2.example.com')).toBe('api.v2.example.com');
    });

    it('should handle special cases', () => {
      expect(timeTracker.extractDomain('https://localhost:3000')).toBe('localhost');
      expect(timeTracker.extractDomain('https://192.168.1.1')).toBe('192.168.1.1');
      expect(timeTracker.extractDomain('chrome://extensions')).toBe('chrome');
    });

    it('should handle international domains', () => {
      // URL constructor converts Unicode to punycode, which is expected behavior
      expect(timeTracker.extractDomain('https://例え.テスト')).toBe('xn--r8jz45g.xn--zckzah');
      expect(timeTracker.extractDomain('https://xn--r8jz45g.xn--zckzah')).toBe('xn--r8jz45g.xn--zckzah');
    });

    it('should handle malformed URLs gracefully', () => {
      expect(timeTracker.extractDomain('not-a-url')).toBe('unknown');
      expect(timeTracker.extractDomain('')).toBe('unknown');
      expect(timeTracker.extractDomain('://missing-protocol')).toBe('unknown');
    });
  });

  describe('Time Calculations', () => {
    it('should calculate basic duration correctly', () => {
      const startTime = 1000;
      const endTime = 5000;
      expect(timeTracker.calculateDuration(startTime, endTime)).toBe(4000);
    });

    it('should calculate duration without end time using current time', () => {
      const startTime = 500;
      jest.spyOn(performance, 'now').mockReturnValue(2500);
      expect(timeTracker.calculateDuration(startTime)).toBe(2000);
    });

    it('should handle millisecond precision correctly', () => {
      const startTime = 1000.123;
      const endTime = 1000.456;
      expect(timeTracker.calculateDuration(startTime, endTime)).toBeCloseTo(0.333, 3);
    });

    it('should handle long-running sessions', () => {
      const startTime = 1000;
      const endTime = 1000 + (24 * 60 * 60 * 1000); // 24 hours
      expect(timeTracker.calculateDuration(startTime, endTime)).toBe(86400000);
    });

    it('should handle zero duration', () => {
      const time = 1000;
      expect(timeTracker.calculateDuration(time, time)).toBe(0);
    });

    it('should handle negative duration gracefully', () => {
      const startTime = 2000;
      const endTime = 1000;
      expect(timeTracker.calculateDuration(startTime, endTime)).toBe(0);
    });
  });

  describe('Session Lifecycle', () => {
    beforeEach(() => {
      mockStorageManager.getActiveSession.mockResolvedValue(null);
      mockStorageManager.getSettings.mockResolvedValue(mockExtensionSettings);
    });

    it('should start a new session successfully', async () => {
      const domain = 'example.com';
      const tabId = 123;
      const windowId = 1;

      const session = await timeTracker.startSession(domain, tabId, windowId);

      expect(session).toEqual({
        domain,
        tabId,
        windowId,
        startTime: 1000,
        isPaused: false
      });

      expect(mockStorageManager.setActiveSession).toHaveBeenCalledWith(session);
    });

    it('should prevent starting session when one is already active', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);

      await expect(timeTracker.startSession('example.com', 123, 1))
        .rejects.toThrow('Cannot start session: another session is already active');
    });

    it('should stop current session and save to storage', async () => {
      const activeSession = { ...mockActiveSession, startTime: 1000 };
      mockStorageManager.getActiveSession.mockResolvedValue(activeSession);
      mockStorageManager.getDomainData.mockResolvedValue({
        totalTime: 0,
        sessions: [],
        dailyStats: {},
        lastAccessed: Date.now()
      });

      jest.spyOn(performance, 'now').mockReturnValue(5000);

      const completedSession = await timeTracker.stopSession();

      expect(completedSession).toEqual({
        startTime: 1000,
        endTime: 5000,
        duration: 4000,
        tabId: mockActiveSession.tabId,
        windowId: mockActiveSession.windowId
      });

      expect(mockStorageManager.setActiveSession).toHaveBeenCalledWith(null);
      expect(mockStorageManager.updateDomainData).toHaveBeenCalled();
    });

    it('should return null when stopping with no active session', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(null);

      const result = await timeTracker.stopSession();

      expect(result).toBeNull();
      expect(mockStorageManager.setActiveSession).not.toHaveBeenCalled();
    });

    it('should pause active session', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);

      const pausedSession = await timeTracker.pauseSession();

      expect(pausedSession).toEqual({
        ...mockActiveSession,
        isPaused: true
      });

      expect(mockStorageManager.setActiveSession).toHaveBeenCalledWith({
        ...mockActiveSession,
        isPaused: true
      });
    });

    it('should resume paused session', async () => {
      const pausedSession = { ...mockActiveSession, isPaused: true };
      mockStorageManager.getActiveSession.mockResolvedValue(pausedSession);

      const resumedSession = await timeTracker.resumeSession();

      expect(resumedSession).toEqual({
        ...pausedSession,
        isPaused: false
      });

      expect(mockStorageManager.setActiveSession).toHaveBeenCalledWith({
        ...pausedSession,
        isPaused: false
      });
    });

    it('should return null when pausing with no active session', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(null);

      const result = await timeTracker.pauseSession();

      expect(result).toBeNull();
    });

    it('should return null when resuming with no active session', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(null);

      const result = await timeTracker.resumeSession();

      expect(result).toBeNull();
    });
  });

  describe('Storage Integration', () => {
    it('should get current session from storage', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);

      const session = await timeTracker.getCurrentSession();

      expect(session).toEqual(mockActiveSession);
      expect(mockStorageManager.getActiveSession).toHaveBeenCalled();
    });

    it('should update domain data when stopping session', async () => {
      const activeSession = { ...mockActiveSession, startTime: 1000 };
      mockStorageManager.getActiveSession.mockResolvedValue(activeSession);
      
      const existingDomainData = {
        totalTime: 5000,
        sessions: [],
        dailyStats: { '2022-01-01': 2000 },
        lastAccessed: Date.now() - 1000
      };
      mockStorageManager.getDomainData.mockResolvedValue(existingDomainData);

      jest.spyOn(performance, 'now').mockReturnValue(4000);

      await timeTracker.stopSession();

      expect(mockStorageManager.updateDomainData).toHaveBeenCalledWith(
        mockActiveSession.domain,
        expect.objectContaining({
          totalTime: 8000, // 5000 + 3000
          lastAccessed: expect.any(Number)
        })
      );
    });

    it('should handle domain data aggregation correctly', async () => {
      const activeSession = { ...mockActiveSession, startTime: 1000 };
      mockStorageManager.getActiveSession.mockResolvedValue(activeSession);
      mockStorageManager.getDomainData.mockResolvedValue({
        totalTime: 0,
        sessions: [],
        dailyStats: {},
        lastAccessed: Date.now()
      });

      jest.spyOn(performance, 'now').mockReturnValue(6000);

      await timeTracker.stopSession();

      const updateCall = mockStorageManager.updateDomainData.mock.calls[0];
      const [domain, updates] = updateCall;

      expect(domain).toBe(mockActiveSession.domain);
      expect(updates.totalTime).toBe(5000);
      expect(updates.sessions).toHaveLength(1);
      expect(updates.sessions?.[0]).toEqual({
        startTime: 1000,
        endTime: 6000,
        duration: 5000,
        tabId: mockActiveSession.tabId,
        windowId: mockActiveSession.windowId
      });
    });

    it('should handle storage errors gracefully when starting session', async () => {
      mockStorageManager.getActiveSession.mockRejectedValue(new Error('Storage error'));

      await expect(timeTracker.startSession('example.com', 123, 1))
        .rejects.toThrow('Failed to start session: Error: Storage error');
    });

    it('should handle storage errors gracefully when stopping session', async () => {
      mockStorageManager.getActiveSession.mockResolvedValue(mockActiveSession);
      mockStorageManager.getDomainData.mockRejectedValue(new Error('Storage error'));

      await expect(timeTracker.stopSession())
        .rejects.toThrow('Failed to stop session: Error: Storage error');
    });

    it('should create empty domain data when none exists', async () => {
      const activeSession = { ...mockActiveSession, startTime: 1000 };
      mockStorageManager.getActiveSession.mockResolvedValue(activeSession);
      mockStorageManager.getDomainData.mockResolvedValue({
        totalTime: 0,
        sessions: [],
        dailyStats: {},
        lastAccessed: expect.any(Number)
      });

      jest.spyOn(performance, 'now').mockReturnValue(3000);

      await timeTracker.stopSession();

      expect(mockStorageManager.updateDomainData).toHaveBeenCalledWith(
        mockActiveSession.domain,
        expect.objectContaining({
          totalTime: 2000,
          sessions: expect.arrayContaining([
            expect.objectContaining({
              duration: 2000
            })
          ])
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should validate domain parameter', async () => {
      await expect(timeTracker.startSession('', 123, 1))
        .rejects.toThrow('Domain cannot be empty');

      await expect(timeTracker.startSession('   ', 123, 1))
        .rejects.toThrow('Domain cannot be empty');
    });

    it('should validate tabId parameter', async () => {
      await expect(timeTracker.startSession('example.com', -1, 1))
        .rejects.toThrow('TabId must be a positive number');

      await expect(timeTracker.startSession('example.com', NaN, 1))
        .rejects.toThrow('TabId must be a positive number');
    });

    it('should validate windowId parameter', async () => {
      await expect(timeTracker.startSession('example.com', 123, -1))
        .rejects.toThrow('WindowId must be a positive number');

      await expect(timeTracker.startSession('example.com', 123, NaN))
        .rejects.toThrow('WindowId must be a positive number');
    });

    it('should handle system clock changes gracefully', () => {
      // Test case where system clock moves backwards
      const startTime = 5000;
      const endTime = 3000; // Clock moved backwards
      
      const duration = timeTracker.calculateDuration(startTime, endTime);
      expect(duration).toBe(0); // Should not return negative duration
    });
  });

  describe('Session Duration Queries', () => {
    it('should get current session duration', () => {
      const session = { ...mockActiveSession, startTime: 1000 };
      jest.spyOn(performance, 'now').mockReturnValue(4000);

      const duration = timeTracker.getSessionDuration(session);

      expect(duration).toBe(3000);
    });

    it('should handle paused session duration correctly', () => {
      const session = { ...mockActiveSession, startTime: 1000, isPaused: true };
      jest.spyOn(performance, 'now').mockReturnValue(4000);

      // When paused, should still calculate from start time
      // (pause time tracking would be handled at a higher level)
      const duration = timeTracker.getSessionDuration(session);

      expect(duration).toBe(3000);
    });
  });
});