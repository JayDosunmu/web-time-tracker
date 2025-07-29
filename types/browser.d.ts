/**
 * Extended browser API type definitions
 */

import 'webextension-polyfill';

declare global {
  namespace browser {
    namespace storage {
      interface StorageArea {
        get<T = any>(keys?: string | string[] | Record<string, any> | null): Promise<T>;
        set(items: Record<string, any>): Promise<void>;
        remove(keys: string | string[]): Promise<void>;
        clear(): Promise<void>;
        getBytesInUse?(keys?: string | string[]): Promise<number>;
        onChanged: {
          addListener(callback: (changes: Record<string, any>, areaName: string) => void): void;
          removeListener(callback: (changes: Record<string, any>, areaName: string) => void): void;
        };
      }
    }

    namespace tabs {
      interface Tab {
        id?: number;
        index: number;
        windowId: number;
        highlighted: boolean;
        active: boolean;
        pinned: boolean;
        url?: string;
        title?: string;
        favIconUrl?: string;
        status?: 'loading' | 'complete';
        incognito: boolean;
        width?: number;
        height?: number;
        sessionId?: string;
      }

      interface OnActivatedActiveInfoType {
        tabId: number;
        windowId: number;
        previousTabId?: number;
      }

      interface OnUpdatedChangeInfoType {
        url?: string;
        status?: 'loading' | 'complete';
        title?: string;
        pinned?: boolean;
        audible?: boolean;
        discarded?: boolean;
        autoDiscardable?: boolean;
        mutedInfo?: {
          muted: boolean;
          reason?: string;
          extensionId?: string;
        };
        favIconUrl?: string;
      }
    }

    namespace windows {
      interface Window {
        id?: number;
        focused: boolean;
        top?: number;
        left?: number;
        width?: number;
        height?: number;
        tabs?: tabs.Tab[];
        incognito: boolean;
        type?: 'normal' | 'popup' | 'panel' | 'app' | 'devtools';
        state?: 'normal' | 'minimized' | 'maximized' | 'fullscreen' | 'docked';
        alwaysOnTop: boolean;
        sessionId?: string;
      }

      interface OnFocusChangedWindowIdType {
        windowId: number;
      }
    }

    namespace runtime {
      interface MessageSender {
        tab?: tabs.Tab;
        frameId?: number;
        id?: string;
        url?: string;
        tlsChannelId?: string;
        origin?: string;
        documentId?: string;
        documentLifecycle?: string;
      }

      interface Port {
        name: string;
        disconnect(): void;
        onDisconnect: {
          addListener(callback: (port: Port) => void): void;
          removeListener(callback: (port: Port) => void): void;
        };
        onMessage: {
          addListener(callback: (message: any, port: Port) => void): void;
          removeListener(callback: (message: any, port: Port) => void): void;
        };
        postMessage(message: any): void;
        sender?: MessageSender;
      }
    }

    namespace webNavigation {
      interface OnCompletedDetailsType {
        tabId: number;
        url: string;
        processId: number;
        frameId: number;
        timeStamp: number;
        parentFrameId?: number;
        documentId: string;
        parentDocumentId?: string;
        documentLifecycle: string;
      }

      interface OnBeforeNavigateDetailsType {
        tabId: number;
        url: string;
        processId: number;
        frameId: number;
        timeStamp: number;
        parentFrameId?: number;
        documentId: string;
        parentDocumentId?: string;
        documentLifecycle: string;
      }
    }

    namespace idle {
      type IdleState = 'active' | 'idle' | 'locked';
      
      interface IdleStateChangedEvent {
        addListener(callback: (newState: IdleState) => void): void;
        removeListener(callback: (newState: IdleState) => void): void;
      }
    }
  }

  // Extend the window object for content scripts
  interface Window {
    timeTrackerExtension?: {
      version: string;
      pillVisible: boolean;
      currentDomain: string;
    };
  }

  // CSS custom properties for the time pill
  interface CSSStyleDeclaration {
    '--pill-opacity'?: string;
    '--pill-position-x'?: string;
    '--pill-position-y'?: string;
  }
}

export {};
