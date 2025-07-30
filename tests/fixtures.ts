/**
 * Shared test fixtures for domains, sessions, and storage data
 */

import type { StorageSchema, DomainData, ActiveSession, ExtensionSettings, Session } from '../types/storage';

/**
 * Default extension settings for testing
 */
export const mockExtensionSettings: ExtensionSettings = {
  pillPosition: 'top-right',
  pillVisibility: true,
  dataRetentionDays: 30,
  excludedDomains: ['localhost', '127.0.0.1']
};

/**
 * Sample domain data for testing
 */
export const mockDomainData: DomainData = {
  totalTime: 3600000, // 1 hour in milliseconds
  sessions: [
    {
      startTime: 1640995200000, // 2022-01-01 00:00:00 UTC
      endTime: 1640995800000,   // 2022-01-01 00:10:00 UTC
      duration: 600000,         // 10 minutes
      tabId: 1,
      windowId: 1
    },
    {
      startTime: 1640996400000, // 2022-01-01 00:20:00 UTC
      endTime: 1640999400000,   // 2022-01-01 01:10:00 UTC
      duration: 3000000,        // 50 minutes
      tabId: 1,
      windowId: 1
    }
  ],
  dailyStats: {
    '2022-01-01': 3600000, // 1 hour
    '2022-01-02': 1800000  // 30 minutes
  },
  lastAccessed: 1640999400000 // 2022-01-01 01:10:00 UTC
};

/**
 * Sample active session for testing
 */
export const mockActiveSession: ActiveSession = {
  domain: 'example.com',
  startTime: 1640995200000, // 2022-01-01 00:00:00 UTC
  tabId: 1,
  windowId: 1,
  isPaused: false
};

/**
 * Complete storage schema for testing
 */
export const mockStorageSchema: StorageSchema = {
  domains: {
    'example.com': mockDomainData,
    'github.com': {
      totalTime: 7200000, // 2 hours
      sessions: [
        {
          startTime: 1640995200000,
          endTime: 1641002400000,
          duration: 7200000,
          tabId: 2,
          windowId: 1
        }
      ],
      dailyStats: {
        '2022-01-01': 7200000
      },
      lastAccessed: 1641002400000
    }
  },
  activeSession: mockActiveSession,
  settings: mockExtensionSettings,
  version: 1,
  installDate: 1640995200000
};

/**
 * Factory functions for creating test data
 */
export const createMockSession = (overrides: Partial<Session> = {}): Session => ({
  startTime: 1640995200000,
  endTime: 1640995800000,
  duration: 600000,
  tabId: 1,
  windowId: 1,
  ...overrides
});

export const createMockActiveSession = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  domain: 'example.com',
  startTime: 1640995200000,
  tabId: 1,
  windowId: 1,
  isPaused: false,
  ...overrides
});

export const createMockDomainData = (overrides: Partial<DomainData> = {}): DomainData => ({
  totalTime: 0,
  sessions: [],
  dailyStats: {},
  lastAccessed: Date.now(),
  ...overrides
});

export const createMockStorageSchema = (overrides: Partial<StorageSchema> = {}): StorageSchema => ({
  domains: {},
  activeSession: null,
  settings: mockExtensionSettings,
  version: 1,
  installDate: Date.now(),
  ...overrides
});

/**
 * URL test data for domain extraction testing
 */
export const urlTestCases = [
  { url: 'https://example.com', expectedDomain: 'example.com' },
  { url: 'https://www.example.com', expectedDomain: 'example.com' },
  { url: 'https://subdomain.example.com/path', expectedDomain: 'subdomain.example.com' },
  { url: 'http://localhost:3000', expectedDomain: 'localhost' },
  { url: 'https://github.com/user/repo', expectedDomain: 'github.com' },
  { url: 'about:blank', expectedDomain: null },
  { url: 'chrome://settings', expectedDomain: null },
  { url: 'moz-extension://abc123', expectedDomain: null }
];

/**
 * Time calculation test data
 */
export const timeTestCases = {
  // Test cases for time duration calculations
  durations: [
    { start: 1640995200000, end: 1640995260000, expected: 60000 }, // 1 minute
    { start: 1640995200000, end: 1640995800000, expected: 600000 }, // 10 minutes
    { start: 1640995200000, end: 1640998800000, expected: 3600000 }, // 1 hour
  ],
  
  // Test cases for daily stats aggregation
  dailyStats: {
    sessions: [
      { startTime: 1640995200000, duration: 600000 }, // 2022-01-01 00:00:00, 10 min
      { startTime: 1641081600000, duration: 1200000 }, // 2022-01-02 00:00:00, 20 min
      { startTime: 1641081900000, duration: 300000 },  // 2022-01-02 00:05:00, 5 min
    ],
    expected: {
      '2022-01-01': 600000,  // 10 minutes
      '2022-01-02': 1500000  // 25 minutes
    }
  }
};