/**
 * Main type definitions export file
 */

// Re-export all types from individual modules
export * from './storage';
export * from './session';
export * from './messages';

// Utility types
export type Timestamp = number;
export type Domain = string;
export type TabId = number;
export type WindowId = number;

// Common interfaces
export interface TimeRange {
  start: number;
  end: number;
}

export interface DateRange {
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
}

// Error types
export class ExtensionError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export class StorageError extends ExtensionError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STORAGE_ERROR', context);
    this.name = 'StorageError';
  }
}

export class SessionError extends ExtensionError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SESSION_ERROR', context);
    this.name = 'SessionError';
  }
}

// Utility type helpers
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

// Configuration constants
export const STORAGE_KEYS = {
  DOMAINS: 'domains',
  ACTIVE_SESSION: 'activeSession',
  SETTINGS: 'settings',
  VERSION: 'version',
  INSTALL_DATE: 'installDate'
} as const;

export const DEFAULT_SETTINGS = {
  pillPosition: 'top-right' as const,
  pillVisibility: true,
  dataRetentionDays: 365,
  excludedDomains: []
};

export const CURRENT_STORAGE_VERSION = 1;

// Time constants
export const TIME_CONSTANTS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000 // Approximate
} as const;

// Domain extraction utility type
export type DomainExtractor = (url: string) => string | null;
