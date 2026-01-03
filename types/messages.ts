/**
 * Message passing type definitions for extension communication
 */

// Base message interface for all extension communications
export interface ExtensionMessage {
  type: string;
  payload: unknown;
  id: string;
  timestamp: number;
}

// Message types for background-content communication
export type MessageType = 
  | 'SESSION_UPDATE'
  | 'SETTINGS_CHANGE'
  | 'GET_SESSION_STATE'
  | 'SESSION_STATE_RESPONSE'
  | 'PILL_VISIBILITY_CHANGE'
  | 'PILL_POSITION_CHANGE'
  | 'ERROR_REPORT';

// Background → Content messages
export interface SessionUpdateMessage extends ExtensionMessage {
  type: 'SESSION_UPDATE';
  payload: {
    domain: string;
    currentTime: number;
    isActive: boolean;
    isPaused: boolean;
    startTime: number;
  };
}

export interface SettingsChangeMessage extends ExtensionMessage {
  type: 'SETTINGS_CHANGE';
  payload: {
    pillPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    pillVisibility: boolean;
    excludedDomains: string[];
  };
}

// Content → Background messages
export interface GetSessionStateMessage extends ExtensionMessage {
  type: 'GET_SESSION_STATE';
  payload: {
    domain: string;
  };
}

export interface SessionStateResponseMessage extends ExtensionMessage {
  type: 'SESSION_STATE_RESPONSE';
  payload: {
    domain: string;
    currentTime: number;
    isActive: boolean;
    isPaused: boolean;
    startTime: number;
  } | null;
}

export interface PillVisibilityChangeMessage extends ExtensionMessage {
  type: 'PILL_VISIBILITY_CHANGE';
  payload: {
    visible: boolean;
  };
}

export interface PillPositionChangeMessage extends ExtensionMessage {
  type: 'PILL_POSITION_CHANGE';
  payload: {
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
}

export interface ErrorReportMessage extends ExtensionMessage {
  type: 'ERROR_REPORT';
  payload: {
    error: string;
    context: string;
    stackTrace?: string;
  };
}

// Union type for all message types
export type ExtensionMessageUnion = 
  | SessionUpdateMessage
  | SettingsChangeMessage
  | GetSessionStateMessage
  | SessionStateResponseMessage
  | PillVisibilityChangeMessage
  | PillPositionChangeMessage
  | ErrorReportMessage;

// Message response wrapper for async communication
export interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Message handler type definition
export type MessageHandler<T extends ExtensionMessage = ExtensionMessage> = (
  message: T,
  sender: browser.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => boolean | Promise<MessageResponse>;

// Message sender utility type
export interface MessageSender {
  sendMessage<T extends ExtensionMessage>(
    message: Omit<T, 'id' | 'timestamp'>
  ): Promise<MessageResponse>;
}