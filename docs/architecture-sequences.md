# Web Time Tracker - Sequence Diagrams

This document shows the detailed sequence of events for key operations in the Web Time Tracker extension.

## Tab Load / Navigation

When a user navigates to a new page or activates a tab:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser
    participant BS as BackgroundService
    participant TT as TimeTracker
    participant SM as StorageManager
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

    BS->>SM: getSettings()
    SM->>Storage: get(['settings'])
    Storage-->>SM: settings
    SM-->>BS: ExtensionSettings

    BS->>BS: Check excludedDomains
    alt Domain is excluded
        BS-->>Browser: Skip tracking
    end

    BS->>SM: getActiveSession()
    SM->>Storage: get(['activeSession'])
    Storage-->>SM: activeSession
    SM-->>BS: ActiveSession | null

    alt Active session exists
        BS->>TT: stopSession()
        TT->>TT: calculateDuration()
        TT->>SM: updateDomainData(domain, session)
        SM->>Storage: set({ domains: {...} })
        TT->>SM: setActiveSession(null)
        SM->>Storage: set({ activeSession: null })
        TT-->>BS: completedSession
    end

    BS->>TT: startSession(domain, tabId, windowId)
    TT->>TT: Create ActiveSession with performance.now()
    TT->>SM: setActiveSession(session)
    SM->>Storage: set({ activeSession })
    TT-->>BS: newSession

    BS->>BS: Build SESSION_UPDATE message
    BS->>MR: browser.tabs.sendMessage(tabId, message)
    MR->>CSM: handleMessage(SESSION_UPDATE)
    CSM->>CSM: broadcastToComponents('onSessionUpdate')
    CSM->>TDP: onSessionUpdate(sessionState)
    TDP->>TDP: Start requestAnimationFrame loop
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
    participant TT as TimeTracker
    participant SM as StorageManager
    participant Storage as browser.storage.local
    participant MR as MessageRouter
    participant TDP as TimeDisplayPill

    Browser->>BS: windows.onFocusChanged(windowId)

    BS->>SM: getActiveSession()
    SM->>Storage: get(['activeSession'])
    Storage-->>SM: activeSession
    SM-->>BS: ActiveSession | null

    alt No active session
        BS-->>Browser: No-op
    end

    alt Window lost focus (windowId === WINDOW_ID_NONE)
        BS->>TT: pauseSession()
        TT->>SM: getActiveSession()
        SM-->>TT: activeSession
        TT->>TT: Set isPaused = true
        TT->>SM: setActiveSession(pausedSession)
        SM->>Storage: set({ activeSession: {..., isPaused: true} })
        TT-->>BS: pausedSession

        BS->>BS: Build SESSION_UPDATE (isPaused: true)
        BS->>MR: browser.tabs.sendMessage()
        MR->>TDP: onSessionUpdate()
        TDP->>TDP: Stop animation, show paused state
    else Window gained focus
        alt Session was paused
            BS->>TT: resumeSession()
            TT->>SM: getActiveSession()
            SM-->>TT: activeSession
            TT->>TT: Set isPaused = false
            TT->>SM: setActiveSession(resumedSession)
            SM->>Storage: set({ activeSession: {..., isPaused: false} })
            TT-->>BS: resumedSession

            BS->>BS: Build SESSION_UPDATE (isPaused: false)
            BS->>MR: browser.tabs.sendMessage()
            MR->>TDP: onSessionUpdate()
            TDP->>TDP: Restart animation loop
        end
    end
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

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser
    participant CSM as ContentScriptManager
    participant MR as MessageRouter
    participant TDP as TimeDisplayPill
    participant BS as BackgroundService
    participant SM as StorageManager

    Browser->>CSM: Content script injected
    CSM->>CSM: getInstance() [Singleton]
    CSM->>CSM: extractDomain(location.href)

    CSM->>MR: initialize()
    MR->>Browser: Register runtime.onMessage listener

    CSM->>CSM: Wait for DOMContentLoaded

    CSM->>TDP: new TimeDisplayPill()
    TDP->>TDP: Create Shadow DOM
    TDP->>TDP: Mount to document.body
    TDP->>TDP: Render connecting state ("--:--:--")

    CSM->>CSM: registerComponent('timeDisplayPill', pill)
    CSM->>CSM: Setup visibility change handler

    loop Retry with exponential backoff (max 5 attempts)
        CSM->>MR: requestSessionState(domain)
        MR->>BS: GET_SESSION_STATE

        alt Background ready
            BS->>SM: getActiveSession()
            SM-->>BS: activeSession
            BS-->>MR: { success: true, data: sessionState }
            MR-->>CSM: response
            CSM->>TDP: onSessionUpdate(state)
            TDP->>TDP: Start animation or show inactive
            Note over CSM: Break retry loop
        else Background not ready
            MR-->>CSM: { success: false, error: "No response..." }
            CSM->>CSM: Wait (100ms * 2^attempt)
        end
    end
```

---

## Settings Change Broadcast

When settings are updated (future feature):

```mermaid
sequenceDiagram
    autonumber
    participant Popup as Popup
    participant SM as StorageManager
    participant Storage as browser.storage.local
    participant BS as BackgroundService
    participant Tabs as browser.tabs
    participant MR as MessageRouter
    participant TDP as TimeDisplayPill

    Popup->>SM: updateSettings({ pillVisibility: false })
    SM->>Storage: set({ settings: {...} })

    BS->>BS: broadcastSettingsChange()
    BS->>SM: getSettings()
    SM-->>BS: settings

    BS->>BS: Build SETTINGS_CHANGE message
    BS->>Tabs: query({}) - get all tabs
    Tabs-->>BS: [tab1, tab2, ...]

    loop For each valid tab
        BS->>MR: browser.tabs.sendMessage(tabId)
        MR->>MR: Find handler for SETTINGS_CHANGE
        MR->>TDP: onSettingsChange(settings)
        TDP->>TDP: Update visibility/position
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

| Trigger | Event | Handler | Result |
|---------|-------|---------|--------|
| Tab switch | `tabs.onActivated` | BackgroundService | Stop old session → Start new → Broadcast |
| URL change | `tabs.onUpdated` | BackgroundService | Stop old session → Start new → Broadcast |
| Navigation complete | `webNavigation.onCompleted` | BackgroundService | Stop old session → Start new → Broadcast |
| Window focus | `windows.onFocusChanged` | BackgroundService | Pause/Resume → Broadcast |
| SPA navigation | `popstate`/`pushState` | ContentScriptManager | Request session state → Update pill |
| Tab visibility | `visibilitychange` | ContentScriptManager | Request fresh state → Update pill |
| Page unload | `beforeunload` | ContentScriptManager | Destroy components → Cleanup |
