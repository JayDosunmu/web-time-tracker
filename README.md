# Web Time Tracker

A Firefox extension that tracks time spent on different websites. It displays a floating timer pill on every page showing your active session duration and provides aggregated per-domain statistics through a popup interface. All data stays local to your browser.

## Features

- **Floating Timer Pill** -- always-visible overlay showing elapsed time on the current domain
- **Automatic Session Management** -- tracking pauses when you switch tabs or lose window focus, and resumes when you return
- **Domain-Level Aggregation** -- time is rolled up by domain with daily, weekly, and monthly breakdowns
- **Privacy-First** -- all data stored in `browser.storage.local`; nothing is transmitted externally
- **Configurable** -- pill position, visibility, and domain exclusion lists

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
│  BackgroundService                                       │
│     ├── SessionManager   (browser event handling)        │
│     ├── TimeTracker      (start / stop / pause logic)    │
│     └── StorageManager   (browser.storage.local)         │
└────────────────────────────┬─────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────┐
│                     Storage Layer                         │
│                                                          │
│  browser.storage.local                                   │
│     ├── Active session state                             │
│     ├── Per-domain time totals                           │
│     └── Daily statistics buckets                         │
└──────────────────────────────────────────────────────────┘
```

**Content Layer** -- Runs on every web page. `ContentScriptManager` initialises the `TimeDisplayPill` (rendered inside a Shadow DOM to avoid style collisions) and a `MessageRouter` that handles typed messages to/from the background service.

**Background Layer** -- A persistent background script that owns the core logic. `BackgroundService` listens to browser events (`tabs.onActivated`, `windows.onFocusChanged`, `webNavigation.onCompleted`, `idle.onStateChanged`) through `SessionManager`, delegates time calculations to `TimeTracker`, and persists data via `StorageManager`.

**Storage Layer** -- All state lives in `browser.storage.local`. Sessions are stored with millisecond precision and aggregated into daily buckets to keep storage bounded.

## Project Structure

```
src/
├── background/
│   ├── background.ts              # Entry point, BackgroundService class
│   ├── services/
│   │   └── TimeTracker.ts         # Core time tracking logic
│   └── models/
│       └── StorageManager.ts      # Type-safe storage abstraction
├── content/
│   ├── content.ts                 # Entry point
│   ├── ContentScriptManager.ts    # Lifecycle and component coordination
│   ├── components/
│   │   ├── TimeDisplayPill.tsx    # Floating timer (Preact + Shadow DOM)
│   │   └── TimeDisplayPill.styles.css
│   ├── messaging/
│   │   └── MessageRouter.ts       # Typed message passing
│   └── styles/
│       └── content.css            # Host element styles
├── popup/
│   ├── popup.html                 # Popup entry point
│   ├── popup.tsx                  # Preact mount
│   ├── popup.css                  # Popup styles
│   └── App.tsx                    # Popup root component
types/
├── index.ts                       # Storage schema, session types
└── messages.ts                    # Message union types

tests/
├── setup.ts                       # Test environment bootstrap
├── fixtures.ts                    # Shared mock data
└── utils.ts                       # Browser API mocking utilities
```

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

### Available Scripts

| Command                | Purpose                                       |
|------------------------|-----------------------------------------------|
| `npm run dev`          | Watch + auto-reload in Firefox                |
| `npm run build:dev`    | Development build with source maps            |
| `npm run build:prod`   | Optimised production build                    |
| `npm test`             | Run all tests                                 |
| `npm run test:watch`   | Run tests in watch mode                       |
| `npm run test:coverage`| Generate coverage report                      |
| `npm run type-check`   | TypeScript type checking (no emit)            |
| `npm run lint`         | ESLint analysis                               |
| `npm run lint:fix`     | Auto-fix lint issues                          |
| `npm run package`      | Package extension into a distributable `.zip` |
| `npm run clean`        | Remove `build/` and `dist/` directories       |

## Technology Stack

- **TypeScript** -- strict mode, explicit return types
- **Vite** + **vite-plugin-web-extension** -- unified build with automatic entry point discovery from `manifest.json`
- **Jest** -- unit testing with `ts-jest` and `jsdom` environment
- **ESLint** -- code quality enforcement
- **web-ext** -- Firefox extension development tooling

## License

MIT
