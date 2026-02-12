# Web Time Tracker - Component Architecture

This document describes the major components of the Web Time Tracker extension and their interactions.

## Component Diagram

```mermaid
graph TB
    subgraph Browser["Browser APIs"]
        tabs["tabs.onActivated<br/>tabs.onUpdated"]
        windows["windows.onFocusChanged"]
        webNav["webNavigation.onCompleted"]
        storage["browser.storage.local"]
        runtime["browser.runtime.sendMessage<br/>browser.tabs.sendMessage"]
    end

    subgraph Background["Background Service Layer"]
        BS["BackgroundService<br/><i>Orchestrator</i>"]
        DMM["DataModelManager<br/><i>Business Logic</i>"]
        TT["TimeTracker<br/><i>Session Management</i>"]
    end

    subgraph Repositories["Shared Repository Layer"]
        HR["HistoryRepository<br/><i>Days/Hours</i>"]
        TR["TabRepository<br/><i>Active Tab</i>"]
        SR["SettingsRepository<br/><i>User Prefs</i>"]
        SM["StorageManager<br/><i>Generic CRUD</i>"]
    end

    subgraph Content["Content Script Layer (per tab)"]
        CSM["ContentScriptManager<br/><i>Per-tab Orchestrator</i>"]
        MR["MessageRouter<br/><i>IPC Handler</i>"]
        TDP["TimeDisplayPill<br/><i>Floating Timer UI</i>"]
    end

    subgraph Popup["Popup Layer"]
        APP["App<br/><i>Dashboard UI</i>"]
    end

    %% Browser events to BackgroundService
    tabs --> BS
    windows --> BS
    webNav --> BS

    %% Background internal flow
    BS --> DMM
    BS --> TT
    DMM --> HR
    DMM --> TR
    DMM --> SR
    HR --> SM
    TR --> SM
    SR --> SM
    SM --> storage

    %% Message passing (signal-based)
    BS -.->|"REFRESH_STATE"| runtime
    runtime -.->|"UPDATE_PILL_POSITION<br/>ERROR_REPORT"| BS

    %% Content script direct storage access
    CSM --> TR
    CSM --> SR
    MR --> CSM
    CSM --> TDP

    %% Popup direct storage access
    APP --> storage
```

## Component Descriptions

### Background Service Layer

| Component | File | Purpose |
|-----------|------|---------|
| **BackgroundService** | [src/background/background.ts](../src/background/background.ts) | Main orchestrator that registers browser event listeners, handles message passing from content scripts, and coordinates session lifecycle |
| **DataModelManager** | [src/background/services/DataModelManager.ts](../src/background/services/DataModelManager.ts) | Business logic for time tracking: handles lifecycle events (TabEnter, TabExit, HourElapsed, DayElapsed), manages active tab state, and coordinates with repositories for data persistence |
| **TimeTracker** | [src/background/services/TimeTracker.ts](../src/background/services/TimeTracker.ts) | Session management for starting/stopping/pausing sessions, extracting domains from URLs, and calculating session durations |

### Repository Layer

> **Architecture Decision:** Repositories are in a **shared module** accessible from both background and content scripts. See [ADR-0002: Shared Storage Layer](adr/0002-shared-storage-layer.md) for rationale.

| Component | File | Purpose |
|-----------|------|---------|
| **HistoryRepository** | [src/shared/repositories/HistoryRepository.ts](../src/shared/repositories/HistoryRepository.ts) | Data access for History, Day, and Hour records. Manages per-day storage keys (`day_YYYY-MM-DD`), hour-level aggregations, and data retention cleanup |
| **TabRepository** | [src/shared/repositories/TabRepository.ts](../src/shared/repositories/TabRepository.ts) | Data access for ActiveTab state. Manages the currently tracked domain with totalTime, visit timestamps, and timer checkpoints |
| **SettingsRepository** | [src/shared/repositories/SettingsRepository.ts](../src/shared/repositories/SettingsRepository.ts) | Data access for ExtensionSettings. Manages user preferences including pill position, visibility, retention days, and excluded domains |
| **StorageManager** | [src/shared/storage/StorageManager.ts](../src/shared/storage/StorageManager.ts) | Pure generic CRUD abstraction over `browser.storage.local` used by repositories |

### Content Script Layer

| Component | File | Purpose |
|-----------|------|---------|
| **ContentScriptManager** | [src/content/ContentScriptManager.ts](../src/content/ContentScriptManager.ts) | Per-tab singleton that manages component lifecycle, handles URL changes (SPA support), and broadcasts updates to UI components |
| **MessageRouter** | [src/content/messaging/MessageRouter.ts](../src/content/messaging/MessageRouter.ts) | Implements `MessageSender` interface for IPC with background service, handles incoming messages and routes to registered handlers |
| **TimeDisplayPill** | [src/content/components/TimeDisplayPill.tsx](../src/content/components/TimeDisplayPill.tsx) | Preact component in Shadow DOM displaying elapsed session time, supports drag positioning and pause/inactive states |

### Popup Layer

| Component | File | Purpose |
|-----------|------|---------|
| **App** | [src/popup/App.tsx](../src/popup/App.tsx) | Dashboard showing current session info and today's total time, polls storage directly for live updates |

---

## Message Protocol

Messages flow between Background and Content Script layers via `browser.runtime.sendMessage` and `browser.tabs.sendMessage`.

> **Architecture Decision:** Content scripts read data directly from storage via shared repositories. Background sends lightweight `REFRESH_STATE` signals to notify content scripts when state changes. See [ADR-0002: Shared Storage Layer](adr/0002-shared-storage-layer.md) for rationale.

```mermaid
graph LR
    subgraph Content["Content Script"]
        MR["MessageRouter"]
        Repos["Repositories<br/>(direct storage read)"]
    end

    subgraph Background["Background Service"]
        BS["BackgroundService"]
    end

    subgraph Storage["browser.storage.local"]
        ST["Storage"]
    end

    MR -->|"UPDATE_PILL_POSITION"| BS
    MR -->|"ERROR_REPORT"| BS
    BS -->|"REFRESH_STATE"| MR
    MR -.->|"read"| Repos
    Repos -.->|"read"| ST
    BS -->|"write"| ST
```

### Message Types

| Message | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| `REFRESH_STATE` | Background → Content | `{ reason: RefreshStateReason }` | Signal content script to read fresh state from storage |
| `UPDATE_PILL_POSITION` | Content → Background | `{ position: PillPosition, source: PositionChangeSource }` | Report pill position change |
| `ERROR_REPORT` | Content → Background | `{ error, context, stackTrace? }` | Report content script errors |

**Note:** `GET_SESSION_STATE` and `GET_SETTINGS` messages are only used during initial load fallback. Normal state access uses direct storage reads via repositories.

### Position Change Source

The `UPDATE_PILL_POSITION` message includes a `source` discriminator to control broadcast behavior:

| Source | Trigger | Background Action |
|--------|---------|-------------------|
| `user_drag` | User drags the pill | Save position, broadcast `SETTINGS_CHANGE` to other tabs |
| `window_resize` | Viewport bounds changed | Save position only (no broadcast) |

### Base Message Interface

```typescript
interface ExtensionMessage {
  type: string;
  payload: unknown;
  id: string;        // Auto-generated unique ID
  timestamp: number; // Message creation time
}

interface MessageResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Refresh state signal payload
type RefreshStateReason = "tab_activated" | "navigation" | "settings_changed" | "service_ready";

interface RefreshStateMessage extends ExtensionMessage {
  type: "REFRESH_STATE";
  payload: { reason: RefreshStateReason };
}

type PositionChangeSource = "user_drag" | "window_resize";
```

---

## Component Interfaces

### StorageManager

Pure generic CRUD abstraction. All domain-specific operations are in repositories.

```typescript
class StorageManager {
  // Singleton
  static getInstance(storage?: StorageArea): StorageManager
  static resetInstance(): void

  // Storage access
  getStorage(): StorageArea

  // Generic CRUD operations
  get<T = unknown>(keys: string | string[]): Promise<Record<string, T>>
  set(items: Record<string, unknown>): Promise<void>
  remove(keys: string | string[]): Promise<void>
  clear(): Promise<void>
  getAll<T = unknown>(): Promise<Record<string, T>>
}
```

> **Note:** Domain-specific operations (getActiveTab, getSettings, getDay) are handled by repositories (TabRepository, SettingsRepository, HistoryRepository).

### TimeTracker

```typescript
class TimeTracker {
  // Singleton
  static getInstance(storageManager?: StorageManager): TimeTracker
  static resetInstance(): void

  // Domain/URL utilities
  extractDomain(url: string): string

  // Duration calculation
  calculateDuration(startTime: number, endTime?: number): number
  getSessionDuration(session: ActiveSession): number

  // Session lifecycle
  startSession(domain: string, tabId: number, windowId: number): Promise<ActiveSession>
  stopSession(): Promise<Session | null>
  pauseSession(): Promise<ActiveSession | null>
  resumeSession(): Promise<ActiveSession | null>
  getCurrentSession(): Promise<ActiveSession | null>
}
```

### DataModelManager

```typescript
class DataModelManager {
  // Singleton
  static getInstance(
    historyRepository?: HistoryRepository,
    tabRepository?: TabRepository,
    settingsRepository?: SettingsRepository
  ): DataModelManager
  static resetInstance(): void

  // Lifecycle
  initialize(): Promise<void>

  // Lifecycle event handlers
  handleTabEnter(context: LifecycleEventContext): Promise<ActiveTab>
  handleTabExit(): Promise<void>
  handleHourElapsed(): Promise<void>
  handleDayElapsed(): Promise<void>

  // Session control
  pauseSession(): Promise<ActiveTab | null>
  resumeSession(): Promise<ActiveTab | null>

  // State access
  getCurrentDisplayTime(): number
  getActiveTab(): ActiveTab | null
  isDomainExcluded(domain: string): Promise<boolean>
}
```

### HistoryRepository

```typescript
class HistoryRepository {
  // Singleton
  static getInstance(storage?: StorageArea): HistoryRepository
  static resetInstance(): void

  // History metadata
  getHistory(): Promise<History>
  setHistory(history: History): Promise<void>

  // Day operations
  getDay(dateKey: string): Promise<Day | null>
  setDay(dateKey: string, day: Day): Promise<void>
  deleteDay(dateKey: string): Promise<void>
  getDaysInRange(startDate: string, endDate: string): Promise<Record<string, Day>>

  // Data retention
  clearExpiredDays(retentionDays: number): Promise<number>

  // Factory methods
  createEmptyDay(timestamp: number): Day

  // Utilities (deprecated - use dateUtils)
  static getDateKey(timestamp: number): string
  static getMidnightTimestamp(timestamp: number): number
}
```

### TabRepository

```typescript
class TabRepository {
  // Singleton
  static getInstance(storage?: StorageArea): TabRepository
  static resetInstance(): void

  // Active tab state
  getActiveTab(): Promise<ActiveTab | null>
  setActiveTab(tab: ActiveTab | null): Promise<void>

  // Factory method
  static createActiveTab(domain: string, totalTime?: number): ActiveTab
}
```

### SettingsRepository

```typescript
class SettingsRepository {
  // Singleton
  static getInstance(storage?: StorageArea): SettingsRepository
  static resetInstance(): void

  // Settings operations
  getSettings(): Promise<ExtensionSettings>
  updateSettings(updates: Partial<ExtensionSettings>): Promise<void>
  setSettings(settings: ExtensionSettings): Promise<void>
  getDefaultSettings(): ExtensionSettings

  // Domain exclusion helpers
  isDomainExcluded(domain: string): Promise<boolean>
  addExcludedDomain(domain: string): Promise<void>
  removeExcludedDomain(domain: string): Promise<void>
}
```

### BackgroundService

```typescript
class BackgroundService {
  // Singleton
  static getInstance(
    dataModelManager?: DataModelManager,
    timeTracker?: TimeTracker,
    settingsRepository?: SettingsRepository
  ): BackgroundService
  static resetInstance(): void

  // Lifecycle
  initialize(): Promise<void>
  isInitialized(): boolean
  shutdown(): Promise<void>

  // Session access
  getCurrentSession(): Promise<ActiveTab | null>

  // Event handlers (private)
  // handleTabActivated(activeInfo: { tabId, windowId })
  // handleTabUpdated(tabId, changeInfo, tab)
  // handleWindowFocusChanged(windowId)
  // handleNavigationCompleted(details: { tabId, frameId, url })
  // handleMessage(message, sender, sendResponse)
}
```

**Message Handlers:**

| Message Type | Handler Action |
|--------------|----------------|
| `GET_SESSION_STATE` | Return current session if domain matches (fallback for initial load) |
| `GET_SETTINGS` | Return current extension settings (fallback for initial load) |
| `UPDATE_PILL_POSITION` | Save position; if `source === "user_drag"`, send `REFRESH_STATE` to other tabs |
| `ERROR_REPORT` | Log error with context |

**Signal Behavior:**

When state changes occur (tab activation, navigation, etc.), the background sends `REFRESH_STATE` signals to relevant content scripts. Content scripts then read fresh data directly from storage via repositories, rather than receiving data in the message payload.

### MessageRouter

```typescript
class MessageRouter implements MessageSender {
  // Lifecycle
  initialize(): void
  destroy(): void

  // Handler registration
  registerHandler<T extends ExtensionMessage>(messageType: string, handler: MessageHandler<T>): void
  unregisterHandler(messageType: string): void

  // Message sending
  sendMessage<T extends ExtensionMessage>(message: Omit<T, "id" | "timestamp">): Promise<MessageResponse>
  requestSessionState(domain: string): Promise<MessageResponse>
  reportError(error: string, context: string, stackTrace?: string): Promise<void>
}
```

### ContentScriptManager

Uses shared repositories for direct storage access. See [ADR-0002: Shared Storage Layer](adr/0002-shared-storage-layer.md).

```typescript
class ContentScriptManager {
  // Singleton
  static getInstance(): ContentScriptManager
  static resetInstance(): void

  // Lifecycle
  initialize(): Promise<void>
  isReady(): boolean
  destroy(): void

  // Domain management
  getDomain(): string
  handleUrlChange(newUrl: string): void

  // Component registry
  registerComponent(name: string, component: any): void
  getComponent<T = any>(name: string): T | null
  unregisterComponent(componentName: string): void

  // Message router access
  getMessageRouter(): MessageRouter

  // Error reporting
  reportError(context: string, error: Error): Promise<void>
}
```

**Initialization Sequence:**

1. Wait for `DOMContentLoaded`
2. Initialize `MessageRouter` and register handler for `REFRESH_STATE`
3. Initialize repositories (SettingsRepository, TabRepository) for direct storage access
4. Read initial settings from storage via repository
5. Create and register `TimeDisplayPill` component with saved position
6. Read initial session state from storage via repository
7. Setup visibility change handler for state refresh

**Data Access Pattern:**

- Content scripts read state directly from `browser.storage.local` via shared repositories
- Background sends `REFRESH_STATE` signals when state changes
- On receiving `REFRESH_STATE`, content script reads fresh data from storage
- No retry logic needed - direct storage access is always available

### TimeDisplayPill

```typescript
class TimeDisplayPill {
  constructor()  // Auto-mounts to DOM in closed Shadow DOM

  // ContentScriptManager broadcast handlers
  onSessionUpdate(state: SessionState | null): void
  onSettingsChange(settings: Partial<ExtensionSettings>): void

  // Position persistence (includes source for broadcast control)
  setPositionChangeCallback(callback: (position: PillPosition, source: PositionChangeSource) => void): void

  // Cleanup
  destroy(): void
}

interface SessionState {
  domain: string;
  currentTime: number;  // elapsed milliseconds
  isActive: boolean;
  isPaused: boolean;
  startTime: number;    // performance.now() value
}

// Internal component state
interface PillState {
  sessionState: SessionState | null;
  position: PillPosition;
  visible: boolean;
  isConnecting: boolean;  // true while awaiting initial session state
}
```

---

## Data Types

### Core Types (V2)

```typescript
interface ActiveTab {
  domain: string;
  totalTime: number;       // Accumulated time for this domain today (ms)
  active: boolean;
  lastActivated: number;   // Timestamp when domain became active
  lastTimerCheck: number;  // Checkpoint for hour/day boundary handling
}

interface HourDomainData {
  totalTime: number;       // ms
  visitCount: number;
}

interface HourData {
  domains: Record<string, HourDomainData>;
}

interface DayDomainData {
  totalTime: number;       // ms
  visitCount: number;
  lastVisited: number;     // timestamp
  lastTimerCheck: number;  // timestamp
}

interface Day {
  totalTime: number;       // Total time across all domains for this day (ms)
  hours: HourData[];       // Index 0-23
  domains: Record<string, DayDomainData>;
  timestamp: number;       // Midnight timestamp (used to track time shifts)
  shiftedHours: Record<string, HourData>; // Key: "hour,shift" for time-shift handling
}

interface History {
  earliest: number;        // Timestamp of earliest day
  latest: number;          // Timestamp of latest day
  days: Record<string, Day>; // Key: "YYYY-MM-DD" format
}

interface ExtensionSettings {
  pillPosition: PillPosition;
  pillVisibility: boolean;
  dataRetentionDays: number;
  excludedDomains: string[];
}

interface PillPosition {
  x: number;
  y: number;
}

interface LifecycleEventContext {
  timestamp: number;
  domain: string;
  tabId: number;
  windowId: number;
}

type LifecycleEventType =
  | "TAB_ENTER"
  | "TAB_EXIT"
  | "SECOND_ELAPSED"
  | "HOUR_ELAPSED"
  | "DAY_ELAPSED"
  | "TIME_CHANGED";
```

### Storage Schema (V2)

```typescript
interface StorageSchemaV2 {
  activeTab: ActiveTab | null;
  history: History;
  settings: ExtensionSettings;
  version: number;
  installDate: number;
}

// Storage keys:
// - "activeTab"          → ActiveTab state
// - "history"            → History metadata
// - "day_YYYY-MM-DD"     → Individual Day records
// - "settings"           → ExtensionSettings
```

---

## Design Patterns

| Pattern | Usage |
|---------|-------|
| **Singleton** | BackgroundService, DataModelManager, TimeTracker, all Repositories, ContentScriptManager (one instance per context) |
| **Repository** | HistoryRepository, TabRepository, SettingsRepository provide domain-specific data access over generic StorageManager |
| **Observer/Pub-Sub** | MessageRouter broadcasts to registered handlers, ContentScriptManager broadcasts to components |
| **Service Layer** | DataModelManager encapsulates business logic and lifecycle events, coordinating between repositories |
| **Adapter** | TimeTracker adapts duration calculation and domain extraction |

### Layered Architecture

```
┌─────────────────────────────────────┐
│  Presentation (Content Scripts)     │
├─────────────────────────────────────┤
│  Orchestration (BackgroundService)  │
├─────────────────────────────────────┤
│  Business Logic (DataModelManager)  │
├─────────────────────────────────────┤
│  Data Access (Repositories)         │
├─────────────────────────────────────┤
│  Persistence (StorageManager)       │
├─────────────────────────────────────┤
│  Storage (browser.storage.local)    │
└─────────────────────────────────────┘
```
