// Base message interface for all extension communications
export interface ExtensionMessage {
  type: string;
  payload: unknown;
  id: string;
  timestamp: number;
}

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
  sendResponse: (response: MessageResponse) => void,
) => boolean | Promise<MessageResponse>;

// Message sender utility type
export interface MessageSender {
  sendMessage<T extends ExtensionMessage>(
    message: Omit<T, "id" | "timestamp">,
  ): Promise<MessageResponse>;
}

// ============================================================================
// Specific Message Types
// ============================================================================

import type { PillPosition } from "./index";

// Session state payload (shared by multiple message types)
export interface SessionStatePayload {
  domain: string;
  currentTime: number;
  isActive: boolean;
  isPaused: boolean;
  startTime: number;
}

// Request session state from background
export interface GetSessionStateMessage extends ExtensionMessage {
  type: "GET_SESSION_STATE";
  payload: { domain: string };
}

// Session state response
export interface SessionStateResponseMessage extends ExtensionMessage {
  type: "SESSION_STATE_RESPONSE";
  payload: SessionStatePayload | null;
}

// Session update broadcast from background to content scripts
export interface SessionUpdateMessage extends ExtensionMessage {
  type: "SESSION_UPDATE";
  payload: SessionStatePayload;
}

// Settings change notification
export interface SettingsChangeMessage extends ExtensionMessage {
  type: "SETTINGS_CHANGE";
  payload: {
    pillPosition?: PillPosition;
    pillVisibility?: boolean;
    excludedDomains?: string[];
  };
}

// Request settings from background
export interface GetSettingsMessage extends ExtensionMessage {
  type: "GET_SETTINGS";
  payload: Record<string, never>;
}

// Update pill position
export interface UpdatePillPositionMessage extends ExtensionMessage {
  type: "UPDATE_PILL_POSITION";
  payload: { position: PillPosition };
}

// Error report from content script
export interface ErrorReportMessage extends ExtensionMessage {
  type: "ERROR_REPORT";
  payload: {
    error: string;
    context: string;
    stackTrace?: string;
  };
}

// Union type for all extension messages
export type ExtensionMessageUnion =
  | GetSessionStateMessage
  | SessionStateResponseMessage
  | SessionUpdateMessage
  | SettingsChangeMessage
  | GetSettingsMessage
  | UpdatePillPositionMessage
  | ErrorReportMessage;
