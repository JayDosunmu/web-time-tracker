/**
 * Core time tracking service with millisecond precision
 */

import type { ActiveSession, Session, DomainData } from '../../../types';
import type { StorageManager } from '../models/StorageManager';

export class TimeTracker {
  private static instance: TimeTracker | null = null;
  private storageManager: StorageManager;

  private constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  public static getInstance(storageManager?: StorageManager): TimeTracker {
    if (!TimeTracker.instance) {
      if (!storageManager) {
        throw new Error('StorageManager is required for first initialization');
      }
      TimeTracker.instance = new TimeTracker(storageManager);
    }
    return TimeTracker.instance;
  }

  public static resetInstance(): void {
    TimeTracker.instance = null;
  }

  /**
   * Extract domain from URL with robust error handling
   */
  public extractDomain(url: string): string {
    try {
      if (!url || typeof url !== 'string') {
        return 'unknown';
      }

      // Handle chrome:// and other special protocols
      if (url.startsWith('chrome://') || url.startsWith('moz-extension://') || url.startsWith('about:')) {
        const parts = url.split('://');
        return parts.length > 1 ? parts[0] : 'unknown';
      }

      // Parse URL using URL constructor
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;

      // Handle IP addresses and localhost
      if (!hostname) {
        return 'unknown';
      }

      return hostname;
    } catch (error) {
      console.warn('Failed to extract domain from URL:', url, error);
      return 'unknown';
    }
  }

  /**
   * Calculate duration between two timestamps with millisecond precision
   */
  public calculateDuration(startTime: number, endTime?: number): number {
    const end = endTime ?? performance.now();
    const duration = end - startTime;
    
    // Ensure non-negative duration (handle clock changes)
    return Math.max(0, duration);
  }

  /**
   * Get duration of an active session
   */
  public getSessionDuration(session: ActiveSession): number {
    return this.calculateDuration(session.startTime);
  }

  /**
   * Start a new tracking session
   */
  public async startSession(domain: string, tabId: number, windowId: number): Promise<ActiveSession> {
    try {
      // Validate inputs
      if (!domain || domain.trim() === '') {
        throw new Error('Domain cannot be empty');
      }

      if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error('TabId must be a positive number');
      }

      if (!Number.isInteger(windowId) || windowId < 0) {
        throw new Error('WindowId must be a positive number');
      }

      // Check if there's already an active session
      const existingSession = await this.storageManager.getActiveSession();
      if (existingSession) {
        throw new Error('Cannot start session: another session is already active');
      }

      // Create new session
      const session: ActiveSession = {
        domain: domain.trim(),
        tabId,
        windowId,
        startTime: performance.now(),
        isPaused: false
      };

      // Save to storage
      await this.storageManager.setActiveSession(session);

      return session;
    } catch (error) {
      console.error('TimeTracker.startSession error:', error);
      throw new Error(`Failed to start session: ${error}`);
    }
  }

  /**
   * Stop the current session and save to domain data
   */
  public async stopSession(): Promise<Session | null> {
    try {
      const activeSession = await this.storageManager.getActiveSession();
      
      if (!activeSession) {
        return null;
      }

      const endTime = performance.now();
      const duration = this.calculateDuration(activeSession.startTime, endTime);

      // Create completed session
      const completedSession: Session = {
        startTime: activeSession.startTime,
        endTime,
        duration,
        tabId: activeSession.tabId,
        windowId: activeSession.windowId
      };

      // Update domain data
      await this.updateDomainData(activeSession.domain, completedSession);

      // Clear active session
      await this.storageManager.setActiveSession(null);

      return completedSession;
    } catch (error) {
      console.error('TimeTracker.stopSession error:', error);
      throw new Error(`Failed to stop session: ${error}`);
    }
  }

  /**
   * Pause the current session
   */
  public async pauseSession(): Promise<ActiveSession | null> {
    try {
      const activeSession = await this.storageManager.getActiveSession();
      
      if (!activeSession) {
        return null;
      }

      const pausedSession: ActiveSession = {
        ...activeSession,
        isPaused: true
      };

      await this.storageManager.setActiveSession(pausedSession);

      return pausedSession;
    } catch (error) {
      console.error('TimeTracker.pauseSession error:', error);
      throw new Error(`Failed to pause session: ${error}`);
    }
  }

  /**
   * Resume a paused session
   */
  public async resumeSession(): Promise<ActiveSession | null> {
    try {
      const activeSession = await this.storageManager.getActiveSession();
      
      if (!activeSession) {
        return null;
      }

      const resumedSession: ActiveSession = {
        ...activeSession,
        isPaused: false
      };

      await this.storageManager.setActiveSession(resumedSession);

      return resumedSession;
    } catch (error) {
      console.error('TimeTracker.resumeSession error:', error);
      throw new Error(`Failed to resume session: ${error}`);
    }
  }

  /**
   * Get the current active session
   */
  public async getCurrentSession(): Promise<ActiveSession | null> {
    return this.storageManager.getActiveSession();
  }

  /**
   * Update domain data with completed session
   */
  private async updateDomainData(domain: string, session: Session): Promise<void> {
    try {
      // Get existing domain data
      const domainData = await this.storageManager.getDomainData(domain);

      // Calculate daily stats key (YYYY-MM-DD format)
      const sessionDate = new Date(Date.now()).toISOString().split('T')[0];
      const existingDailyTime = domainData.dailyStats[sessionDate] || 0;

      // Update domain data
      const updatedData: Partial<DomainData> = {
        totalTime: domainData.totalTime + session.duration,
        sessions: [...domainData.sessions, session],
        dailyStats: {
          ...domainData.dailyStats,
          [sessionDate]: existingDailyTime + session.duration
        },
        lastAccessed: Date.now()
      };

      await this.storageManager.updateDomainData(domain, updatedData);
    } catch (error) {
      console.error('TimeTracker.updateDomainData error:', error);
      throw error;
    }
  }
}