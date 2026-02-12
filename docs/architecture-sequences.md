# Web Time Tracker - Sequence Diagrams

This document shows the detailed sequence of events for key operations in the Web Time Tracker extension.

## Tab Load / Navigation (TAB_ENTER)

When a user navigates to a new page or activates a tab:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser
    participant BS as BackgroundService
    participant DMM as DataModelManager
    participant TT as TimeTracker
    participant HR as HistoryRepository
    participant TR as TabRepository
    participant SR as SettingsRepository
    participant Storage as browser.storage.local
    participant MR as MessageRouter
    participant CSM as ContentScriptManager
    participant TDP as TimeDisplayPill

    Browser->>BS: tabs.onActivated / webNavigation.onCompleted

    BS->>BS: isValidUrl(url)
    alt Invalid URL (chrome://, about:, etc.)
        BS-->>Browser: Skip tracking
    end

    BS->>TT: extractDomain(url)
    TT-->>BS: domain

    BS->>DMM: isDomainExcluded(domain)
    DMM->>SR: isDomainExcluded(domain)
    SR->>Storage: get(['settings'])
    Storage-->>SR: settings
    SR-->>DMM: boolean
    DMM-->>BS: boolean

    alt Domain is excluded
        BS-->>Browser: Skip tracking
    end

    BS->>DMM: handleTabEnter(context)

    Note over DMM: If domain changed, first handleTabExit()

    DMM->>HR: getDay(dateKey)
    HR->>Storage: get(['day_YYYY-MM-DD'])
    Storage-->>HR: Day | null
    HR-->>DMM: Day

    alt Day doesn't exist
        DMM->>HR: createEmptyDay(midnightTimestamp)
        DMM->>HR: setDay(dateKey, day)
        HR->>Storage: set({ day_YYYY-MM-DD: day })
    end

    DMM->>DMM: Create ActiveTab with accumulated totalTime
    DMM->>TR: setActiveTab(activeTab)
    TR->>Storage: set({ activeTab })

    DMM->>DMM: Increment domain visit count
    DMM->>HR: setDay(dateKey, updatedDay)
    HR->>Storage: set({ day_YYYY-MM-DD: updatedDay })

    DMM-->>BS: ActiveTab

    BS->>BS: Build REFRESH_STATE signal
    BS->>MR: browser.tabs.sendMessage(tabId, REFRESH_STATE)
    MR->>CSM: handleMessage(REFRESH_STATE)
    CSM->>CSM: readStateFromStorage()
    CSM->>CSM: Read from TabRepository + SettingsRepository
    CSM->>CSM: broadcastToComponents('onSessionUpdate')
    CSM->>TDP: onSessionUpdate(sessionState)
    TDP->>TDP: Start requestAnimationFrame loop
    CSM->>TDP: onSettingsChange(settings)
    TDP->>TDP: Apply position/visibility
```

---

## Tab Unload / Page Navigation Away

When a user navigates away or closes a tab:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser
    participant CSM as ContentScriptManager
    participant MR as MessageRouter
    participant TDP as TimeDisplayPill

    Browser->>CSM: beforeunload / visibilitychange

    CSM->>CSM: destroy()

    CSM->>MR: destroy()
    MR->>MR: Clear all handlers

    loop For each registered component
        CSM->>TDP: destroy()
        TDP->>TDP: cancelAnimationFrame()
        TDP->>TDP: Remove Shadow DOM from body
    end

    CSM->>CSM: Clear component registry
    CSM->>CSM: Remove visibility listener

    Note over Browser,TDP: Background maintains session<br/>Next tab activation triggers<br/>new session start
```

---

## Window Focus Change

When the browser window gains or loses focus:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser
    participant BS as BackgroundService
    participant DMM as DataModelManager
    participant HR as HistoryRepository
    participant TR as TabRepository
    participant Storage as browser.storage.local
    participant MR as MessageRouter
    participant TDP as TimeDisplayPill

    Browser->>BS: windows.onFocusChanged(windowId)

    BS->>DMM: getActiveTab()
    DMM-->>BS: ActiveTab | null

    alt No active tab
        BS-->>Browser: No-op
    end

    alt Window lost focus (windowId === WINDOW_ID_NONE)
        BS->>DMM: pauseSession()
        DMM->>DMM: Calculate elapsed = now - lastTimerCheck
        DMM->>DMM: recordElapsedTime(elapsed, now)
        DMM->>HR: setDay(dateKey, updatedDay)
        HR->>Storage: set({ day_YYYY-MM-DD })
        DMM->>DMM: Set activeTab.active = false
        DMM->>TR: setActiveTab(activeTab)
        TR->>Storage: set({ activeTab })
        DMM-->>BS: pausedActiveTab

        BS->>BS: Build REFRESH_STATE signal
        BS->>MR: browser.tabs.sendMessage(REFRESH_STATE)
        MR->>CSM: handleMessage(REFRESH_STATE)
        CSM->>CSM: readStateFromStorage()
        CSM->>TDP: onSessionUpdate(state with isActive: false)
        TDP->>TDP: Stop animation, show paused state
    else Window gained focus
        alt Session was paused (active = false)
            BS->>DMM: resumeSession()
            DMM->>DMM: Set activeTab.active = true
            DMM->>DMM: Set activeTab.lastTimerCheck = now
            DMM->>TR: setActiveTab(activeTab)
            TR->>Storage: set({ activeTab })
            DMM-->>BS: resumedActiveTab

            BS->>BS: Build REFRESH_STATE signal
            BS->>MR: browser.tabs.sendMessage(REFRESH_STATE)
            MR->>CSM: handleMessage(REFRESH_STATE)
            CSM->>CSM: readStateFromStorage()
            CSM->>TDP: onSessionUpdate(state with isActive: true)
            TDP->>TDP: Restart animation loop
        end
    end
```

---

## Hour Boundary (HOUR_ELAPSED)

When the clock crosses an hour boundary:

```mermaid
sequenceDiagram
    autonumber
    participant Timer as hourBoundaryTimer
    participant DMM as DataModelManager
    participant HR as HistoryRepository
    participant TR as TabRepository
    participant Storage as browser.storage.local

    Note over Timer,DMM: Timer fires at top of hour

    Timer->>DMM: handleHourElapsed()

    DMM->>DMM: Check activeTab exists and is active
    alt No active tab or inactive
        DMM-->>Timer: No-op
    end

    DMM->>DMM: Calculate elapsed = now - lastTimerCheck

    DMM->>DMM: recordElapsedTime(elapsed, now)
    DMM->>HR: getDay(dateKey)
    HR->>Storage: get(['day_YYYY-MM-DD'])
    Storage-->>HR: Day
    HR-->>DMM: Day

    DMM->>DMM: Update Day.totalTime += elapsed
    DMM->>DMM: Update hours[currentHour].domains[domain].totalTime
    DMM->>DMM: Update domains[domain].totalTime

    DMM->>HR: setDay(dateKey, updatedDay)
    HR->>Storage: set({ day_YYYY-MM-DD: updatedDay })

    DMM->>DMM: Update activeTab.lastTimerCheck = now
    DMM->>TR: setActiveTab(activeTab)
    TR->>Storage: set({ activeTab })

    DMM->>DMM: setupHourBoundaryDetection()
    Note over DMM: Schedule next timer for next hour
```

---

## Day Boundary (DAY_ELAPSED)

When the clock crosses midnight:

```mermaid
sequenceDiagram
    autonumber
    participant Timer as dayBoundaryTimer
    participant DMM as DataModelManager
    participant HR as HistoryRepository
    participant TR as TabRepository
    participant SR as SettingsRepository
    participant Storage as browser.storage.local

    Note over Timer,DMM: Timer fires at midnight (local timezone)

    Timer->>DMM: handleDayElapsed()

    DMM->>DMM: Check activeTab exists and is active
    alt No active tab or inactive
        DMM-->>Timer: No-op (just reset timers)
    end

    DMM->>DMM: Calculate elapsed = now - lastTimerCheck

    Note over DMM: Record remaining time to yesterday
    DMM->>DMM: recordElapsedTime(elapsed, lastTimerCheck)
    DMM->>HR: getDay(yesterdayDateKey)
    DMM->>HR: setDay(yesterdayDateKey, updatedDay)

    Note over DMM: Reset ActiveTab for new day
    DMM->>DMM: activeTab.totalTime = 0
    DMM->>DMM: activeTab.lastTimerCheck = now
    DMM->>DMM: activeTab.lastActivated = now
    DMM->>TR: setActiveTab(activeTab)
    TR->>Storage: set({ activeTab })

    Note over DMM: Clear expired days
    DMM->>SR: getSettings()
    SR->>Storage: get(['settings'])
    Storage-->>SR: settings
    SR-->>DMM: { dataRetentionDays: 30 }

    DMM->>HR: clearExpiredDays(dataRetentionDays)
    HR->>HR: Find days older than retention period
    loop For each expired day
        HR->>Storage: remove('day_YYYY-MM-DD')
        HR->>HR: Update history metadata
    end
    HR->>Storage: set({ history: updatedHistory })
    HR-->>DMM: deletedCount

    Note over DMM: Reset boundary timers
    DMM->>DMM: setupDayBoundaryDetection()
    DMM->>DMM: setupHourBoundaryDetection()
```

---

## SPA Navigation (Single Page App)

When URL changes within a single-page application:

```mermaid
sequenceDiagram
    autonumber
    participant SPA as SPA Router
    participant CSM as ContentScriptManager
    participant MR as MessageRouter
    participant BS as BackgroundService
    participant TT as TimeTracker
    participant SM as StorageManager
    participant TDP as TimeDisplayPill

    Note over SPA,CSM: SPA triggers URL change<br/>(history.pushState, popstate, hashchange)

    SPA->>CSM: handleUrlChange(newUrl)
    CSM->>CSM: extractDomain(newUrl)

    alt Domain unchanged
        CSM-->>SPA: No action needed
    else Domain changed
        CSM->>CSM: Update currentDomain
        CSM->>MR: requestSessionState(newDomain)

        MR->>MR: Build GET_SESSION_STATE message
        MR->>BS: browser.runtime.sendMessage()

        BS->>BS: handleGetSessionState()
        BS->>SM: getActiveSession()
        SM-->>BS: activeSession

        alt Session matches new domain
            BS->>TT: getSessionDuration(activeSession)
            TT-->>BS: currentTime
            BS-->>MR: { success: true, data: sessionState }
        else No matching session
            BS-->>MR: { success: true, data: null }
        end

        MR-->>CSM: MessageResponse
        CSM->>CSM: broadcastToComponents('onSessionUpdate')
        CSM->>TDP: onSessionUpdate(state)
        TDP->>TDP: Update display
    end
```

---

## Initial Content Script Load

When a content script initializes on page load:

> **Architecture Decision:** Content scripts use shared repositories for direct storage access, eliminating dependency on background service. See [ADR-0002: Shared Storage Layer](adr/0002-shared-storage-layer.md).

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser
    participant CSM as ContentScriptManager
    participant MR as MessageRouter
    participant SR as SettingsRepository
    participant TR as TabRepository
    participant Storage as browser.storage.local
    participant TDP as TimeDisplayPill

    Browser->>CSM: Content script injected
    CSM->>CSM: getInstance() [Singleton]
    CSM->>CSM: extractDomain(location.href)

    CSM->>SR: getInstance(browser.storage.local)
    CSM->>TR: getInstance(browser.storage.local)

    CSM->>MR: initialize()
    MR->>MR: Register REFRESH_STATE handler
    MR->>Browser: Register runtime.onMessage listener

    CSM->>CSM: Wait for DOMContentLoaded

    CSM->>SR: getSettings()
    SR->>Storage: get(['settings'])
    Storage-->>SR: settings
    SR-->>CSM: settings (position, visibility)

    CSM->>TDP: new TimeDisplayPill(initialPosition)
    TDP->>TDP: Create closed Shadow DOM
    TDP->>TDP: Mount to document.body

    CSM->>CSM: registerComponent('timeDisplayPill', pill)
    CSM->>TDP: onSettingsChange(settings)
    TDP->>TDP: Apply visibility setting

    CSM->>CSM: readStateFromStorage()
    CSM->>TR: getActiveTab()
    TR->>Storage: get(['activeTab'])
    Storage-->>TR: activeTab
    TR-->>CSM: activeTab

    alt ActiveTab matches current domain
        CSM->>CSM: Build sessionState from activeTab
        CSM->>TDP: onSessionUpdate(sessionState)
        TDP->>TDP: Start animation loop
    else No matching session
        CSM->>TDP: onSessionUpdate(null)
        TDP->>TDP: Show inactive state
    end

    CSM->>CSM: Setup visibility change handler

    Note over CSM: Visibility change handler will<br/>read fresh state from storage when tab<br/>becomes visible again
```

**Direct Storage Access:**

Content scripts read state directly from `browser.storage.local` via shared repositories. This eliminates the need for retry logic since storage is always available, even when the background service worker is suspended.

---

## State Refresh Signal (Signal-Based)

> **Architecture Decision:** Background sends lightweight `REFRESH_STATE` signals. Content scripts read data from storage via repositories. See [ADR-0002](adr/0002-shared-storage-layer.md).

When state changes, background signals content scripts to refresh from storage:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser Event
    participant BS as BackgroundService
    participant DMM as DataModelManager
    participant TR as TabRepository
    participant Storage as browser.storage.local
    participant Tabs as browser.tabs
    participant MR as MessageRouter
    participant CSM as ContentScriptManager
    participant TDP as TimeDisplayPill

    Browser->>BS: Tab activated / Navigation
    BS->>DMM: Handle session change
    DMM->>TR: setActiveTab(activeTab)
    TR->>Storage: set({ activeTab })

    BS->>BS: Build REFRESH_STATE signal
    BS->>Tabs: sendMessage(tabId, REFRESH_STATE)
    Tabs->>MR: onMessage(REFRESH_STATE)
    MR->>CSM: handleRefreshState()
    CSM->>CSM: readStateFromStorage()
    CSM->>Storage: Read via TabRepository + SettingsRepository
    Storage-->>CSM: activeTab, settings
    CSM->>TDP: onSessionUpdate(state)
    CSM->>TDP: onSettingsChange(settings)
    TDP->>TDP: Apply state and settings
```

---

## Cross-Tab Position Sync

When a user drags the pill in one tab, the position syncs to other tabs:

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant TDP_A as TimeDisplayPill (Tab A)
    participant MR_A as MessageRouter (Tab A)
    participant BS as BackgroundService
    participant SR as SettingsRepository
    participant Storage as browser.storage.local
    participant Tabs as browser.tabs
    participant MR_B as MessageRouter (Tab B)
    participant CSM_B as ContentScriptManager (Tab B)
    participant TDP_B as TimeDisplayPill (Tab B)

    User->>TDP_A: Drag pill to new position
    TDP_A->>TDP_A: Track drag (mouse events)
    TDP_A->>TDP_A: Clamp to viewport bounds
    TDP_A->>MR_A: positionCallback({x, y}, "user_drag")

    MR_A->>BS: UPDATE_PILL_POSITION {position, source: "user_drag"}
    BS->>SR: updateSettings({pillPosition})
    SR->>Storage: set({settings})

    Note over BS: source === "user_drag" triggers REFRESH_STATE

    BS->>Tabs: query({}) - get all tabs
    Tabs-->>BS: [Tab A, Tab B, ...]

    loop For each tab except Tab A
        BS->>MR_B: REFRESH_STATE {reason: "settings_changed"}
        MR_B->>CSM_B: handleRefreshState()
        CSM_B->>CSM_B: readStateFromStorage()
        CSM_B->>Storage: Read via SettingsRepository
        Storage-->>CSM_B: settings with new pillPosition
        CSM_B->>TDP_B: onSettingsChange({pillPosition})
        TDP_B->>TDP_B: Apply position (no save back)
    end
```

---

## Window Resize Position Clamp

When the window resizes, the pill position is clamped without cross-tab broadcast:

```mermaid
sequenceDiagram
    autonumber
    participant Window as Window
    participant TDP as TimeDisplayPill
    participant MR as MessageRouter
    participant BS as BackgroundService
    participant SR as SettingsRepository

    Window->>TDP: resize event
    TDP->>TDP: Calculate new viewport bounds
    TDP->>TDP: Clamp position if outside bounds

    alt Position changed
        TDP->>MR: positionCallback({x, y}, "window_resize")
        MR->>BS: UPDATE_PILL_POSITION {position, source: "window_resize"}
        BS->>SR: updateSettings({pillPosition})
        Note over BS: source === "window_resize"<br/>No broadcast to other tabs
    end
```

---

## Error Reporting

When a content script encounters an error:

```mermaid
sequenceDiagram
    autonumber
    participant TDP as TimeDisplayPill
    participant CSM as ContentScriptManager
    participant MR as MessageRouter
    participant BS as BackgroundService

    TDP->>TDP: Error occurs
    TDP-->>CSM: Error bubbles up

    CSM->>CSM: reportError(context, error)
    CSM->>MR: reportError(message, context, stackTrace)

    MR->>MR: Build ERROR_REPORT message
    MR->>BS: browser.runtime.sendMessage()

    BS->>BS: handleErrorReport()
    BS->>BS: console.error() with context
    BS-->>MR: { success: true }
```

---

## Summary: Event → Component Flow

| Trigger | Event | Handler | Lifecycle | Result |
|---------|-------|---------|-----------|--------|
| Tab switch | `tabs.onActivated` | BackgroundService → DataModelManager | TAB_EXIT → TAB_ENTER | Record time → Start new → Send REFRESH_STATE |
| URL change | `tabs.onUpdated` | BackgroundService → DataModelManager | TAB_EXIT → TAB_ENTER | Record time → Start new → Send REFRESH_STATE |
| Navigation complete | `webNavigation.onCompleted` | BackgroundService → DataModelManager | TAB_EXIT → TAB_ENTER | Record time → Start new → Send REFRESH_STATE |
| Window focus lost | `windows.onFocusChanged` | BackgroundService → DataModelManager | pauseSession() | Record time → Set inactive → Send REFRESH_STATE |
| Window focus gained | `windows.onFocusChanged` | BackgroundService → DataModelManager | resumeSession() | Set active → Send REFRESH_STATE |
| Hour boundary | `setTimeout` | DataModelManager | HOUR_ELAPSED | Record time → Reset checkpoint |
| Day boundary | `setTimeout` | DataModelManager | DAY_ELAPSED | Record time → Reset totals → Clear expired |
| SPA navigation | `popstate`/`pushState` | ContentScriptManager | Read storage | Read state from repositories → Update pill |
| Tab visibility | `visibilitychange` | ContentScriptManager | Read storage | Read fresh state from repositories → Update pill |
| Page unload | `beforeunload` | ContentScriptManager | Cleanup | Destroy components → Cleanup |
| User drags pill | `mouseup` | TimeDisplayPill → BackgroundService | UPDATE_PILL_POSITION | Save position → Send REFRESH_STATE (excl. origin) |
| Window resize | `resize` | TimeDisplayPill → BackgroundService | UPDATE_PILL_POSITION | Save position (no broadcast) |
