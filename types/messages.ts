/**
 * Message types for communication between extension components
 */

import type { ActiveSession, PopupData, DomainStats } from './storage';

// Base message type
export interface BaseMessage {
  type: string;
  timestamp: number;
  id?: string;
}

// Content script to background messages
export interface GetCurrentTimeMessage extends BaseMessage {
  type: 'GET_CURRENT_TIME';
}

export interface GetCurrentSessionMessage extends BaseMessage {
  type: 'GET_CURRENT_SESSION';
}

// Background to content script messages
export interface TimeUpdateMessage extends BaseMessage {
  type: 'TIME_UPDATE';
  payload: {
    currentTime: number;
    domain: string;
    isActive: boolean;
  };
}

export interface SessionChangedMessage extends BaseMessage {
  type: 'SESSION_CHANGED';
  payload: {
    newSession: ActiveSession | null;
    previousSession: ActiveSession | null;
  };
}

// Popup messages
export interface GetPopupDataMessage extends BaseMessage {
  type: 'GET_POPUP_DATA';
}

export interface GetDomainStatsMessage extends BaseMessage {
  type: 'GET_DOMAIN_STATS';
  payload: {
    period: 'today' | 'week' | 'month' | 'all';
    limit?: number;
  };
}

// Settings messages
export interface UpdateSettingsMessage extends BaseMessage {
  type: 'UPDATE_SETTINGS';
  payload: {
    pillPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    pillVisibility?: boolean;
    dataRetentionDays?: number;
    excludedDomains?: string[];
  };
}

// Response messages
export interface TimeResponseMessage extends BaseMessage {
  type: 'TIME_RESPONSE';
  payload: {
    currentTime: number;
    domain: string;
    isActive: boolean;
    startTime: number;
  };
}

export interface SessionResponseMessage extends BaseMessage {
  type: 'SESSION_RESPONSE';
  payload: {
    session: ActiveSession | null;
  };
}

export interface PopupDataResponseMessage extends BaseMessage {
  type: 'POPUP_DATA_RESPONSE';
  payload: PopupData;
}

export interface DomainStatsResponseMessage extends BaseMessage {
  type: 'DOMAIN_STATS_RESPONSE';
  payload: {
    stats: DomainStats[];
    period: 'today' | 'week' | 'month' | 'all';
  };
}

export interface ErrorResponseMessage extends BaseMessage {
  type: 'ERROR_RESPONSE';
  payload: {
    error: string;
    code?: string;
    originalMessage?: string;
  };
}

// Union type for all possible messages
export type ExtensionMessage = 
  | GetCurrentTimeMessage
  | GetCurrentSessionMessage
  | TimeUpdateMessage
  | SessionChangedMessage
  | GetPopupDataMessage
  | GetDomainStatsMessage
  | UpdateSettingsMessage
  | TimeResponseMessage
  | SessionResponseMessage
  | PopupDataResponseMessage
  | DomainStatsResponseMessage
  | ErrorResponseMessage;

// Message handlers type
export interface MessageHandler<T extends ExtensionMessage = ExtensionMessage> {
  (message: T, sender: browser.runtime.MessageSender): Promise<ExtensionMessage | void> | ExtensionMessage | void;
}

// Port message types for real-time communication
export interface PortMessage {
  type: string;
  payload?: unknown;
  timestamp: number;
}

export interface PopupPortMessage extends PortMessage {
  type: 'POPUP_CONNECTED' | 'POPUP_DISCONNECTED' | 'REQUEST_UPDATES';
}

export interface ContentPortMessage extends PortMessage {
  type: 'CONTENT_CONNECTED' | 'CONTENT_DISCONNECTED' | 'PILL_VISIBILITY_CHANGED';
  payload?: {
    visible?: boolean;
    domain?: string;
  };
}
