# Web Time Tracker - Data Flow

This document describes how data flows through the Web Time Tracker extension.

## High-Level Data Flow

```mermaid
flowchart TD
    subgraph User["User Actions"]
        browse["Browse websites"]
        switch["Switch tabs"]
        focus["Change window focus"]
    end

    subgraph Browser["Browser Events"]
        tabActivated["tabs.onActivated"]
        tabUpdated["tabs.onUpdated"]
        navCompleted["webNavigation.onCompleted"]
        winFocus["windows.onFocusChanged"]
    end

    subgraph Background["Background Service"]
        BS["BackgroundService<br/><i>Event Handler</i>"]
        DMM["DataModelManager<br/><i>Business Logic</i>"]
        TT["TimeTracker<br/><i>Session Logic</i>"]
    end

    subgraph Repositories["Repository Layer"]
        HR["HistoryRepository"]
        TR["TabRepository"]
        SR["SettingsRepository"]
    end

    subgraph Storage["browser.storage.local"]
        activeTab[("activeTab<br/>ActiveTab | null")]
        history[("history<br/>History metadata")]
        dayRecords[("day_YYYY-MM-DD<br/>Day records")]
        settings[("settings<br/>ExtensionSettings")]
    end

    subgraph Content["Content Script (per tab)"]
        CSM["ContentScriptManager"]
        TDP["TimeDisplayPill"]
    end

    subgraph Popup["Popup"]
        APP["App Component"]
    end

    %% User triggers browser events
    browse --> tabUpdated
    browse --> navCompleted
    switch --> tabActivated
    focus --> winFocus

    %% Browser events flow to BackgroundService
    tabActivated --> BS
    tabUpdated --> BS
    navCompleted --> BS
    winFocus --> BS

    %% Background processes events
    BS --> DMM
    BS --> TT
    DMM --> HR
    DMM --> TR
    DMM --> SR

    %% Repository to Storage operations
    HR --> history
    HR --> dayRecords
    TR --> activeTab
    SR --> settings

    %% Session updates broadcast to content scripts
    BS -.->|"SESSION_UPDATE"| CSM
    CSM --> TDP

    %% Popup reads storage directly
    APP --> activeTab
    APP --> dayRecords
```

---

## Session Start Flow (TAB_ENTER)

When a user navigates to a new page or switches tabs:

```mermaid
flowchart LR
    subgraph Input
        event["Tab Event"]
    end

    subgraph Processing
        validate["Validate URL<br/>(http/https only)"]
        extract["Extract Domain"]
        checkExcluded["Check Excluded<br/>Domains"]
        tabExit["handleTabExit()<br/>(if domain changed)"]
        tabEnter["handleTabEnter()<br/>TAB_ENTER lifecycle"]
    end

    subgraph Storage
        getToday["Get/Create Today's<br/>Day record"]
        createActiveTab["Create ActiveTab<br/>with accumulated time"]
        updateDomain["Increment domain<br/>visit count"]
    end

    subgraph Output
        persist["Persist to<br/>TabRepository"]
        broadcast["Broadcast<br/>SESSION_UPDATE"]
    end

    event --> validate
    validate -->|valid| extract
    validate -->|invalid| X1[("Skip")]
    extract --> checkExcluded
    checkExcluded -->|not excluded| tabExit
    checkExcluded -->|excluded| X2[("Skip")]
    tabExit --> tabEnter
    tabEnter --> getToday
    getToday --> createActiveTab
    createActiveTab --> updateDomain
    updateDomain --> persist
    persist --> broadcast
```

---

## Session Stop Flow (TAB_EXIT)

When stopping a session (due to tab switch, navigation, or shutdown):

```mermaid
flowchart LR
    subgraph Input
        trigger["Stop Trigger"]
    end

    subgraph Processing
        getActive["Get ActiveTab"]
        calcElapsed["Calculate elapsed<br/>since lastTimerCheck"]
        tabExit["handleTabExit()<br/>TAB_EXIT lifecycle"]
    end

    subgraph Storage
        recordTime["recordElapsedTime()<br/>- Update Day totalTime<br/>- Update Hour domains<br/>- Update Day domains"]
        clearActive["Clear activeTab<br/>(TabRepository)"]
    end

    trigger --> getActive
    getActive -->|exists| calcElapsed
    getActive -->|null| X[("No-op")]
    calcElapsed --> tabExit
    tabExit --> recordTime
    recordTime --> clearActive
```

---

## Time Recording Flow

When elapsed time is recorded (during TAB_EXIT, HOUR_ELAPSED, or DAY_ELAPSED):

```mermaid
flowchart TD
    subgraph Input
        elapsed["elapsed: 5000ms"]
        timestamp["timestamp: Date.now()"]
    end

    subgraph DayRecord["Day Record (day_YYYY-MM-DD)"]
        dayTotal["totalTime += 5000ms"]
        hourData["hours[currentHour].domains[domain].totalTime += 5000ms"]
        dayDomain["domains[domain].totalTime += 5000ms"]
    end

    subgraph ActiveTab["ActiveTab (in-memory)"]
        tabTotal["totalTime += 5000ms"]
        checkpoint["lastTimerCheck = timestamp"]
    end

    elapsed --> dayTotal
    elapsed --> hourData
    elapsed --> dayDomain
    elapsed --> tabTotal
    timestamp --> checkpoint
```

### Data Hierarchy

```
History (metadata)
└── days: Record<"YYYY-MM-DD", Day>
    └── Day
        ├── totalTime (all domains this day)
        ├── hours[0-23]: HourData[]
        │   └── domains: Record<domain, HourDomainData>
        │       ├── totalTime
        │       └── visitCount
        └── domains: Record<domain, DayDomainData>
            ├── totalTime
            ├── visitCount
            ├── lastVisited
            └── lastTimerCheck
```

---

## Storage Schema (V2)

```mermaid
erDiagram
    STORAGE {
        object activeTab
        object history
        object settings
        number version
        number installDate
    }

    STORAGE ||--|| ACTIVE_TAB : contains
    ACTIVE_TAB {
        string domain
        number totalTime
        boolean active
        number lastVisited
        number lastTimerCheck
    }

    STORAGE ||--|| HISTORY : contains
    HISTORY {
        number earliest
        number latest
        object days
    }

    HISTORY ||--o{ DAY : "day_YYYY-MM-DD"
    DAY {
        number totalTime
        array hours
        object domains
        number timestamp
        object shiftedHours
    }

    DAY ||--o{ HOUR_DATA : "hours[0-23]"
    HOUR_DATA {
        object domains
    }

    HOUR_DATA ||--o{ HOUR_DOMAIN_DATA : "domains[domain]"
    HOUR_DOMAIN_DATA {
        number totalTime
        number visitCount
    }

    DAY ||--o{ DAY_DOMAIN_DATA : "domains[domain]"
    DAY_DOMAIN_DATA {
        number totalTime
        number visitCount
        number lastVisited
        number lastTimerCheck
    }

    STORAGE ||--|| SETTINGS : contains
    SETTINGS {
        object pillPosition
        boolean pillVisibility
        number dataRetentionDays
        array excludedDomains
    }
```

### Storage Keys

| Key Pattern | Type | Description |
|-------------|------|-------------|
| `activeTab` | `ActiveTab \| null` | Current domain tracking state |
| `history` | `History` | Metadata: earliest/latest timestamps, day references |
| `day_YYYY-MM-DD` | `Day` | Per-day records with hourly breakdowns |
| `settings` | `ExtensionSettings` | User preferences |

---

## Lifecycle Events

The `DataModelManager` handles these lifecycle events:

| Event | Trigger | Action |
|-------|---------|--------|
| `TAB_ENTER` | User navigates to a new domain | Exit previous tab, create/restore ActiveTab for domain, increment visit count |
| `TAB_EXIT` | User leaves current domain | Record elapsed time, clear ActiveTab |
| `HOUR_ELAPSED` | Clock crosses hour boundary | Record elapsed time to current hour, reset timer checkpoint |
| `DAY_ELAPSED` | Clock crosses midnight | Record remaining time to yesterday, reset ActiveTab for new day, clear expired days |

### Boundary Detection

```mermaid
flowchart TD
    subgraph Timers["Boundary Timers"]
        hourTimer["hourBoundaryTimer<br/>(setTimeout to next hour)"]
        dayTimer["dayBoundaryTimer<br/>(setTimeout to midnight)"]
    end

    subgraph Handlers["Event Handlers"]
        hourHandler["handleHourElapsed()"]
        dayHandler["handleDayElapsed()"]
    end

    subgraph Actions["Actions"]
        recordHour["Record time to<br/>current hour"]
        recordDay["Record time to<br/>yesterday"]
        resetDay["Reset ActiveTab<br/>totalTime = 0"]
        clearExpired["Clear days older than<br/>dataRetentionDays"]
    end

    hourTimer -->|triggers| hourHandler
    dayTimer -->|triggers| dayHandler

    hourHandler --> recordHour
    hourHandler -->|reset| hourTimer

    dayHandler --> recordDay
    dayHandler --> resetDay
    dayHandler --> clearExpired
    dayHandler -->|reset| hourTimer
    dayHandler -->|reset| dayTimer
```

---

## Shared Utilities

Date operations are centralized in `src/shared/dateUtils.ts`:

| Function | Purpose |
|----------|---------|
| `getDateKey(timestamp)` | Returns `YYYY-MM-DD` format (local timezone) |
| `getMidnightTimestamp(timestamp)` | Returns timestamp of midnight (00:00:00.000) |
| `getDayStorageKey(timestamp)` | Returns storage key `day_YYYY-MM-DD` |

All date operations use **local timezone** to match user expectations.

---

## Message Flow

> **Architecture Decision:** Settings use a **push-based model** for reliability. See [ADR-0001: Push-Based Settings](adr/0001-push-based-settings.md).

### Content Script → Background

```mermaid
sequenceDiagram
    participant CS as ContentScriptManager
    participant MR as MessageRouter
    participant RT as browser.runtime
    participant BS as BackgroundService

    CS->>MR: requestSessionState(domain)
    MR->>MR: Generate message ID
    MR->>RT: sendMessage(GET_SESSION_STATE)
    RT->>BS: onMessage
    BS->>BS: getActiveSession()
    BS-->>RT: MessageResponse
    RT-->>MR: response
    MR-->>CS: { success, data }
```

### Background → Content Script

```mermaid
sequenceDiagram
    participant BS as BackgroundService
    participant TT as TimeTracker
    participant RT as browser.tabs
    participant CS as ContentScriptManager
    participant TDP as TimeDisplayPill

    BS->>TT: startSession()
    TT-->>BS: ActiveSession
    BS->>BS: Build SESSION_UPDATE
    BS->>BS: Build SETTINGS_CHANGE
    BS->>RT: sendMessage(tabId, SESSION_UPDATE)
    BS->>RT: sendMessage(tabId, SETTINGS_CHANGE)
    RT->>CS: onMessage (SESSION_UPDATE)
    CS->>CS: broadcastToComponents()
    CS->>TDP: onSessionUpdate(state)
    TDP->>TDP: Start animation loop
    RT->>CS: onMessage (SETTINGS_CHANGE)
    CS->>TDP: onSettingsChange(settings)
    TDP->>TDP: Apply position/visibility
```

### Push-Based Settings Flow

Settings changes are pushed from background to content scripts rather than pulled. This ensures reliability even when the service worker is suspended.

```mermaid
flowchart TD
    subgraph Trigger["Trigger Events"]
        tab["Tab Activation"]
        nav["Navigation"]
        drag["User Drags Pill"]
    end

    subgraph Background["Background Service"]
        wake["Service Worker Wakes"]
        push["Push SETTINGS_CHANGE"]
        broadcast["broadcastSettingsChange()"]
    end

    subgraph ContentScript["Content Script"]
        receive["Receive Message"]
        apply["Apply Settings"]
    end

    tab --> wake
    nav --> wake
    wake --> push
    push --> receive
    receive --> apply

    drag -->|"UPDATE_PILL_POSITION<br/>source: user_drag"| broadcast
    broadcast -->|"SETTINGS_CHANGE<br/>(excludes origin tab)"| receive
```

### Position Sync Flow

When a user drags the pill, the position syncs across all tabs:

```mermaid
sequenceDiagram
    participant TabA as Tab A (TimeDisplayPill)
    participant MR as MessageRouter
    participant BS as BackgroundService
    participant SR as SettingsRepository
    participant TabB as Tab B (TimeDisplayPill)

    TabA->>TabA: User drags pill
    TabA->>MR: UPDATE_PILL_POSITION {source: "user_drag"}
    MR->>BS: sendMessage()
    BS->>SR: updateSettings({pillPosition})
    BS->>BS: broadcastSettingsChange(excludeTabId: TabA)
    BS->>TabB: SETTINGS_CHANGE {pillPosition}
    TabB->>TabB: Apply position (no save back)
```

---

## Data Lifecycle

| Phase | Location | Data | Description |
|-------|----------|------|-------------|
| **Active** | Memory + Storage | `ActiveTab` | Currently tracking domain with accumulated `totalTime` |
| **Recorded** | Storage | `Day.hours[h].domains[d]` | Hour-level time aggregation |
| **Aggregated** | Storage | `Day.domains[d]` | Day-level time aggregation |
| **Historical** | Storage | `History.days` | Multi-day tracking with retention |
| **Displayed** | UI | `SessionState` | Current elapsed time for display |

---

## Timing Precision

- **lastTimerCheck**: Uses `Date.now()` for checkpoint tracking
- **totalTime**: Calculated as `totalTime + (now - lastTimerCheck)` when active
- **currentTime**: Updated via `requestAnimationFrame` in TimeDisplayPill
- **Day records**: Keyed by ISO date string (`YYYY-MM-DD`)
- **Hour records**: Indexed 0-23 within each Day

---

## Popup Data Access

The popup reads storage directly (no message passing):

```mermaid
flowchart LR
    subgraph Popup["Popup Component"]
        useEffect["useEffect<br/>setInterval(1000ms)"]
        state["useState<br/>- currentSession<br/>- todayTotal"]
    end

    subgraph Storage["browser.storage.local"]
        activeTab["activeTab"]
        dayRecord["day_YYYY-MM-DD"]
    end

    useEffect -->|"storage.get()"| Storage
    dayRecord -->|"Day.totalTime"| state
    activeTab -->|"ActiveTab"| state
```
