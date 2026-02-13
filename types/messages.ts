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

// Refresh state reason discriminator
export type RefreshStateReason =
  | "tab_activated"
  | "navigation"
  | "settings_changed"
  | "service_ready";

// Signal content script to refresh state from storage
export interface RefreshStateMessage extends ExtensionMessage {
  type: "REFRESH_STATE";
  payload: {
    reason: RefreshStateReason;
  };
}

// Request settings from background
export interface GetSettingsMessage extends ExtensionMessage {
  type: "GET_SETTINGS";
  payload: Record<string, never>;
}

// Position change source discriminator
export type PositionChangeSource = "user_drag" | "window_resize";

// Update pill position
export interface UpdatePillPositionMessage extends ExtensionMessage {
  type: "UPDATE_PILL_POSITION";
  payload: {
    position: PillPosition;
    source: PositionChangeSource;
  };
}

// Update pill show full info setting
export interface UpdatePillShowFullInfoMessage extends ExtensionMessage {
  type: "UPDATE_PILL_SHOW_FULL_INFO";
  payload: {
    showFullInfo: boolean;
  };
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
  | RefreshStateMessage
  | GetSettingsMessage
  | UpdatePillPositionMessage
  | UpdatePillShowFullInfoMessage
  | ErrorReportMessage;
