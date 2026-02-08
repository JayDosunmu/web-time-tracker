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
