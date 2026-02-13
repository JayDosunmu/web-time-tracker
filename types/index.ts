/**
 * Main type definitions export file
 */

export interface ActiveSession {
  domain: string;
  startTime: number;
  tabId: number;
  windowId: number;
  isPaused?: boolean;
}

export interface Session {
  startTime: number;
  endTime?: number;
  duration: number;
  tabId: number;
  windowId: number;
}

export interface DomainData {
  totalTime: number;
  sessions: Session[];
  dailyStats: Record<string, number>; // ISO date string -> milliseconds
  lastAccessed: number; // Last time this domain was visited
}

export interface PillPosition {
  x: number;
  y: number;
}

export interface ExtensionSettings {
  pillPosition: PillPosition;
  pillVisibility: boolean;
  pillShowFullInfo: boolean; // Whether pill shows expanded info (full mode)
  dataRetentionDays: number; // How many days to keep detailed session data
  excludedDomains: string[]; // Domains to ignore for tracking
}

export interface StorageSchema {
  domains: Record<string, DomainData>;
  activeSession: ActiveSession | null;
  settings: ExtensionSettings;
  version: number; // For data migration
  installDate: number; // When extension was first installed
}

export interface TimeAggregation {
  today: number;
  thisWeek: number;
  thisMonth: number;
  allTime: number;
}

export interface DomainStats extends TimeAggregation {
  domain: string;
  percentage: number; // Percentage of total time spent
  averageSessionDuration: number;
  sessionCount: number;
}

export interface PopupData {
  totalTime: TimeAggregation;
  domainStats: DomainStats[];
  currentSession: {
    domain: string;
    currentTime: number;
    isActive: boolean;
  } | null;
  lastUpdated: number;
}

// Migration types for handling storage schema changes
export interface MigrationData {
  fromVersion: number;
  toVersion: number;
  migrationDate: number;
  backupCreated: boolean;
}

// ============================================================================
// V2 Data Model Types
// ============================================================================

/**
 * Active tab state - tracks the currently active domain
 */
export interface ActiveTab {
  domain: string;
  totalTime: number; // Accumulated time for this domain today (ms)
  active: boolean;
  lastActivated: number; // Timestamp when domain became active
  lastTimerCheck: number; // Checkpoint for hour/day boundary handling
}

/**
 * Hour-level domain data
 */
export interface HourDomainData {
  totalTime: number; // ms
  visitCount: number;
}

/**
 * Hour-level aggregation
 */
export interface HourData {
  domains: Record<string, HourDomainData>;
}

/**
 * Day-level domain data
 */
export interface DayDomainData {
  totalTime: number; // ms
  visitCount: number;
  lastVisited: number; // timestamp
  lastTimerCheck: number; // timestamp
}

/**
 * Day-level aggregation
 */
export interface Day {
  totalTime: number; // Total time across all domains for this day (ms)
  hours: HourData[]; // Index 0-23
  domains: Record<string, DayDomainData>;
  timestamp: number; // Midnight timestamp (used to track time shifts)
  shiftedHours: Record<string, HourData>; // Key: "hour,shift" for time-shift handling
}

/**
 * History container - holds all days
 */
export interface History {
  earliest: number; // Timestamp of earliest day
  latest: number; // Timestamp of latest day
  days: Record<string, Day>; // Key: "YYYY-MM-DD" format
}

/**
 * V2 Storage Schema
 */
export interface StorageSchemaV2 {
  activeTab: ActiveTab | null;
  history: History;
  settings: ExtensionSettings;
  version: number;
  installDate: number;
}

/**
 * Lifecycle event context
 */
export interface LifecycleEventContext {
  timestamp: number;
  domain: string;
  tabId: number;
  windowId: number;
}

/**
 * Lifecycle event types
 */
export type LifecycleEventType =
  | "TAB_ENTER"
  | "TAB_EXIT"
  | "SECOND_ELAPSED"
  | "HOUR_ELAPSED"
  | "DAY_ELAPSED"
  | "TIME_CHANGED";

// Re-export message types
export * from "./messages";
