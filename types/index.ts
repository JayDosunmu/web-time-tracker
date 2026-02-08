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
  dataRetentionDays: number; // How many days to keep detailed session data
  excludedDomains: string[]; // Domains to ignore for tracking
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

// Re-export message types
export * from "./messages";
