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

        BS->>BS: Build SESSION_UPDATE (isActive: false)
        BS->>MR: browser.tabs.sendMessage()
        MR->>TDP: onSessionUpdate()
        TDP->>TDP: Stop animation, show paused state
    else Window gained focus
        alt Session was paused (active = false)
            BS->>DMM: resumeSession()
            DMM->>DMM: Set activeTab.active = true
            DMM->>DMM: Set activeTab.lastTimerCheck = now
            DMM->>TR: setActiveTab(activeTab)
            TR->>Storage: set({ activeTab })
            DMM-->>BS: resumedActiveTab

            BS->>BS: Build SESSION_UPDATE (isActive: true)
            BS->>MR: browser.tabs.sendMessage()
            MR->>TDP: onSessionUpdate()
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

| Trigger | Event | Handler | Lifecycle | Result |
|---------|-------|---------|-----------|--------|
| Tab switch | `tabs.onActivated` | BackgroundService → DataModelManager | TAB_EXIT → TAB_ENTER | Record time → Start new → Broadcast |
| URL change | `tabs.onUpdated` | BackgroundService → DataModelManager | TAB_EXIT → TAB_ENTER | Record time → Start new → Broadcast |
| Navigation complete | `webNavigation.onCompleted` | BackgroundService → DataModelManager | TAB_EXIT → TAB_ENTER | Record time → Start new → Broadcast |
| Window focus lost | `windows.onFocusChanged` | BackgroundService → DataModelManager | pauseSession() | Record time → Set inactive → Broadcast |
| Window focus gained | `windows.onFocusChanged` | BackgroundService → DataModelManager | resumeSession() | Set active → Broadcast |
| Hour boundary | `setTimeout` | DataModelManager | HOUR_ELAPSED | Record time → Reset checkpoint |
| Day boundary | `setTimeout` | DataModelManager | DAY_ELAPSED | Record time → Reset totals → Clear expired |
| SPA navigation | `popstate`/`pushState` | ContentScriptManager | Request state | Request session state → Update pill |
| Tab visibility | `visibilitychange` | ContentScriptManager | Request state | Request fresh state → Update pill |
| Page unload | `beforeunload` | ContentScriptManager | Cleanup | Destroy components → Cleanup |
