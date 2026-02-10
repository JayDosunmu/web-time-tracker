# Web Time Tracker

A Firefox extension that tracks time spent on different websites. It displays a floating timer pill on every page showing your active session duration and provides aggregated per-domain statistics through a popup interface. All data stays local to your browser.

## Features

### Timer Pill
- **Floating Timer Display** -- always-visible overlay showing elapsed time in HH:MM:SS format
- **Draggable Positioning** -- drag the pill to any position on screen; position persists across sessions
- **Hover-to-Hide** -- mouseover hides the pill content, showing only a subtle border indicator for its position
- **Connection Status** -- displays `--:--:--` while connecting to background service

### Time Tracking
- **Per-Domain Tracking** -- time is tracked separately for each website domain
- **Daily Bucketing** -- time totals reset at midnight; each day's data is stored independently
- **Historical Intervals** -- stores the start/end timestamps of every viewing session per domain
- **Automatic Session Management** -- tracking pauses when you switch tabs or lose window focus, and resumes when you return

### Popup Interface
- **Current Session Display** -- shows active session time with domain name
- **Today's Total** -- aggregated time across all domains for the current day

### Privacy & Data
- **Privacy-First** -- all data stored in `browser.storage.local`; nothing is transmitted externally

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     Content Layer                        │
│                                                          │
│  ContentScriptManager ─── MessageRouter                  │
│         │                      │                         │
│   TimeDisplayPill         browser.runtime                │
│   (Shadow DOM)            .sendMessage()                 │
└────────────────────────────┬─────────────────────────────┘
                             │  messages (typed)
┌────────────────────────────▼─────────────────────────────┐
│                    Background Layer                       │
│                                                          │
│  BackgroundService (event orchestration)                 │
│     ├── DataModelManager (business logic)                │
│     │      ├── handleTabEnter / handleTabExit            │
│     │      └── hour/day boundary detection               │
│     └── TimeTracker (session start / stop / pause)       │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                   Repository Layer                        │
│                                                          │
│  HistoryRepository    TabRepository    SettingsRepository │
│  (days / hours)       (active tab)     (user prefs)      │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                     Storage Layer                         │
│                                                          │
│  browser.storage.local                                   │
│     ├── activeTab (current domain state)                 │
│     ├── history (day metadata)                           │
│     ├── day_YYYY-MM-DD (per-day hourly aggregations)     │
│     └── settings (user preferences)                      │
└──────────────────────────────────────────────────────────┘
```

**Content Layer** -- Runs on every web page. `ContentScriptManager` initialises the `TimeDisplayPill` (rendered inside a Shadow DOM to avoid style collisions) and a `MessageRouter` that handles typed messages to/from the background service.

**Background Layer** -- A persistent background script that owns the core logic. `BackgroundService` listens to browser events (`tabs.onActivated`, `windows.onFocusChanged`, `webNavigation.onCompleted`) and coordinates with `DataModelManager` for business logic (lifecycle events like TAB_ENTER, TAB_EXIT, HOUR_ELAPSED, DAY_ELAPSED) and `TimeTracker` for session management.

**Repository Layer** -- Domain-specific data access. `HistoryRepository` manages historical day/hour data, `TabRepository` manages active tab state, and `SettingsRepository` manages user preferences. Each repository provides a type-safe API for its domain.

**Storage Layer** -- All state lives in `browser.storage.local`. Data is organized hierarchically: `activeTab` for current state, `history` for day metadata, individual `day_YYYY-MM-DD` keys for daily aggregations with hourly breakdowns, and `settings` for user preferences.

### Detailed Documentation

For deeper architectural understanding, see the docs folder:

| Document | Description |
|----------|-------------|
| [Component Architecture](docs/architecture-components.md) | Component diagram, interfaces, and method signatures for all classes |
| [Data Flow](docs/architecture-dataflow.md) | How data moves through the system, storage schema, and message flows |
| [Sequence Diagrams](docs/architecture-sequences.md) | Step-by-step sequences for tab load/unload, focus changes, and SPA navigation |

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | >= 18   |
| npm         | (bundled with Node) |
| Firefox     | >= 109  |

## Local Development Setup

### 1. Install dependencies

```bash
git clone https://github.com/JayDosunmu/web-time-tracker.git
cd web-time-tracker
npm install
```

### 2. Run in Firefox with auto-reload

```bash
npm run dev
```

This starts Vite in watch mode and launches Firefox with the extension loaded via `web-ext`. Code changes trigger an automatic rebuild and extension reload.

### 3. Or load manually

```bash
npm run build:dev
```

Then in Firefox:

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `dist/manifest.json`

## Technology Stack

- **TypeScript** -- strict mode, explicit return types
- **Vite** + **vite-plugin-web-extension** -- unified build with automatic entry point discovery from `manifest.json`
- **Jest** -- unit testing with `ts-jest` and `jsdom` environment
- **ESLint** -- code quality enforcement
- **web-ext** -- Firefox extension development tooling

## License

MIT
