/**
 * Session management types
 */

import type { ActiveSession } from './storage';

export type SessionState = 'active' | 'paused' | 'inactive' | 'ending';

export interface SessionTransition {
  from: SessionState;
  to: SessionState;
  timestamp: number;
  reason: SessionTransitionReason;
  metadata?: Record<string, unknown>;
}

export type SessionTransitionReason = 
  | 'tab_activated'
  | 'tab_deactivated'
  | 'window_focus_changed'
  | 'page_navigation'
  | 'tab_closed'
  | 'manual_pause'
  | 'manual_resume'
  | 'browser_idle'
  | 'browser_active'
  | 'extension_startup'
  | 'extension_shutdown';

export interface SessionEvent {
  type: 'session_started' | 'session_ended' | 'session_paused' | 'session_resumed' | 'time_updated';
  payload: {
    session: ActiveSession;
    previousSession?: ActiveSession;
    elapsedTime?: number;
    metadata?: Record<string, unknown>;
  };
  timestamp: number;
}

export interface TabInfo {
  id: number;
  windowId: number;
  url: string;
  domain: string;
  title?: string;
  isActive: boolean;
  lastActivated: number;
}

export interface WindowInfo {
  id: number;
  focused: boolean;
  tabs: TabInfo[];
  lastFocused: number;
}

// Browser event payloads
export interface TabActivatedInfo {
  tabId: number;
  windowId: number;
  previousTabId?: number;
}

export interface TabUpdatedInfo {
  tabId: number;
  changeInfo: {
    url?: string;
    status?: 'loading' | 'complete';
    title?: string;
  };
  tab: browser.tabs.Tab;
}

export interface WindowFocusChangedInfo {
  windowId: number;
  focused: boolean;
  previousWindowId?: number;
}
