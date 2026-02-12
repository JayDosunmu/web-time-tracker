# ADR-0002: Shared Storage Layer for Cross-Context Data Access

**Date:** 2026-02-11

**Status:** Accepted

## Context

The Web Time Tracker extension has two main execution contexts:

1. **Background script**: Handles browser events, manages time tracking state, coordinates across tabs
2. **Content scripts**: Run in each tab, display the timer pill UI

Previously, content scripts depended entirely on the background script for data:
- Sent `GET_SESSION_STATE` messages to request current session
- Sent `GET_SETTINGS` messages to request settings (position, visibility)
- Received `SESSION_UPDATE` and `SETTINGS_CHANGE` messages with data payloads

This created reliability issues:
- When extension reloads, content scripts lose connection to background
- If background service worker is suspended (MV3), requests timeout
- Content scripts couldn't access data even though it exists in `browser.storage.local`
- Timer pill would show stale data or fail to load correct position

Both contexts have access to `browser.storage.local` (granted via manifest `"storage"` permission), but the repository and storage manager classes were located in the background folder, making them awkward to import from content scripts.

## Decision

Create a **shared module** (`src/shared/`) containing:
- `StorageManager` - Type-safe wrapper around `browser.storage.local`
- `SettingsRepository` - Settings data access (pill position, visibility, excluded domains)
- `TabRepository` - Active tab state access
- `HistoryRepository` - Historical time data access

Both background and content scripts import from this shared module:
- **Background**: Full read/write access for state management
- **Content scripts**: Read-only access for resilient data loading

Change the communication pattern from "push data" to "signal + read":
- Background sends lightweight `REFRESH_STATE` signal (no data payload)
- Content script reads current state from storage via repositories
- Content script can also read on initialization without waiting for background

## Consequences

### Positive

- **Resilient loading**: Content scripts can read saved position/settings even if background is unavailable
- **Consistent interface**: Both contexts use same repository API, ensuring data model consistency
- **Smaller messages**: Signals are ~50 bytes vs ~200+ bytes for data payloads
- **Simpler debugging**: Data always comes from one source (storage), easier to trace
- **Future-proof**: Works well with MV3 service worker suspension model

### Negative

- **More storage reads**: Each tab reads independently vs single background read + broadcast
- **Larger content script bundle**: Includes repository code (~3-5KB additional)
- **Potential stale reads**: Brief window where content script reads before background writes

### Neutral

- Requires updating import paths across background files
- Need to ensure repositories remain stateless (no caching that could diverge)

## Implementation

### File Structure

```
src/
├── shared/
│   ├── repositories/
│   │   ├── SettingsRepository.ts
│   │   ├── TabRepository.ts
│   │   ├── HistoryRepository.ts
│   │   └── index.ts
│   ├── storage/
│   │   ├── StorageManager.ts
│   │   └── index.ts
│   ├── dateUtils.ts
│   └── index.ts
├── background/
│   └── ... (imports from ../shared/)
└── content/
    └── ContentScriptManager.ts (imports from ../shared/)
```

### New Message Type

```typescript
interface RefreshStateMessage extends ExtensionMessage {
  type: "REFRESH_STATE";
  payload: { reason: "tab_activated" | "navigation" | "settings_changed" | "service_ready" };
}
```

### Removed Message Types

- `SESSION_UPDATE` (replaced by `REFRESH_STATE` signal)
- `SETTINGS_CHANGE` (replaced by `REFRESH_STATE` signal)

### Key Changes

1. **ContentScriptManager** initializes repositories and reads directly from storage
2. **Background** sends `REFRESH_STATE` signals instead of data-carrying messages
3. **onInstalled handler** notifies existing tabs when extension reloads

## References

- [ADR-0001: Push-Based Settings](0001-push-based-settings.md) - Previous architecture decision (now superseded)
- [MDN: storage API in content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage)
