# ADR-0001: Push-Based Settings Architecture

**Date:** 2026-02-11

**Status:** Superseded by [ADR-0002: Shared Storage Layer](0002-shared-storage-layer.md)

> **Note:** This ADR describes the intermediate push-based architecture using `SESSION_UPDATE` and `SETTINGS_CHANGE` messages. ADR-0002 supersedes this with a signal-based architecture where content scripts read directly from storage via shared repositories, and background sends lightweight `REFRESH_STATE` signals instead of data-carrying messages.

## Decision

Convert the timer pill settings flow from pull-based (content script requests settings via `GET_SETTINGS`) to push-based (background broadcasts settings changes via `SETTINGS_CHANGE`).

## Context

The extension experienced intermittent errors when retrieving settings:
- `warn: failed to get settings: unknown error`
- `error: failed to save pill position: no response from background`

These errors occurred because the content script used a pull-based model for settings, which required the background service worker to be awake and responsive. Service workers can be suspended by the browser, causing message requests to timeout.

In contrast, the session time updates worked reliably because they use a push-based model - the background service pushes `SESSION_UPDATE` messages to content scripts when browser events occur (tab activation, navigation, etc.). These events wake the service worker, ensuring it's always active when sending updates.

### Pull-Based Flow (Previous)

```
Content Script → GET_SETTINGS request → Background (must be awake) → Response
```

### Push-Based Flow (Current)

```
Browser Event → Wakes Background → Background pushes SETTINGS_CHANGE → Content Script
```

## Consequences

### Positive

- Settings sync becomes reliable (same pattern as working session updates)
- Cross-tab position sync: when user drags pill in Tab A, Tab B receives update
- Removes retry logic complexity for settings retrieval
- Consistent architecture across all background-to-content communication

### Negative

- Slightly more complex message handling in background
- Must prevent infinite loops when receiving external settings updates

## Position Save Restrictions

To prevent unnecessary saves and infinite loops:

| Trigger | Action |
|---------|--------|
| User drags pill | Save position, broadcast to other tabs |
| Window resize changes position | Save position (no broadcast) |
| Initial mount clamp | Local state only (no save) |
| Receiving settings push | Apply position (no save back) |

## Implementation

### Message Types

Added `PositionChangeSource` discriminator to `UpdatePillPositionMessage`:

```typescript
type PositionChangeSource = "user_drag" | "window_resize";
```

### Key Files Modified

- `types/messages.ts` - Added source to position update payload
- `src/content/components/TimeDisplayPill.tsx` - Source tracking, external update detection
- `src/content/ContentScriptManager.ts` - Updated position callback signature
- `src/background/background.ts` - Added `broadcastSettingsChange()`, push on session updates

### Message Flow

**User Drag:**
```
Tab A: drag → UPDATE_PILL_POSITION{source: "user_drag"}
  → Background saves → SETTINGS_CHANGE to Tab B, C (excludes Tab A)
Tab B: receives → applies position (no save back)
```

**Window Resize:**
```
Tab A: resize → position clamped → UPDATE_PILL_POSITION{source: "window_resize"}
  → Background saves (no broadcast)
```

**Tab Activation:**
```
Browser event → Background wakes
  → SESSION_UPDATE + SETTINGS_CHANGE push → Content Script
```
