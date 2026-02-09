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
        TT["TimeTracker<br/><i>Session Logic</i>"]
        SM["StorageManager<br/><i>Data Layer</i>"]
    end

    subgraph Storage["browser.storage.local"]
        domains[("domains<br/>{domain → DomainData}")]
        activeSession[("activeSession<br/>ActiveSession | null")]
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
    BS --> TT
    TT --> SM

    %% Storage operations
    SM --> domains
    SM --> activeSession
    SM --> settings

    %% Session updates broadcast to content scripts
    BS -.->|"SESSION_UPDATE"| CSM
    CSM --> TDP

    %% Popup reads storage directly
    APP --> domains
    APP --> activeSession
```

---

## Session Start Flow

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
        stopOld["Stop Current<br/>Session"]
        startNew["Start New<br/>Session"]
    end

    subgraph Output
        storage["Save to Storage"]
        broadcast["Broadcast<br/>SESSION_UPDATE"]
    end

    event --> validate
    validate -->|valid| extract
    validate -->|invalid| X1[("Skip")]
    extract --> checkExcluded
    checkExcluded -->|not excluded| stopOld
    checkExcluded -->|excluded| X2[("Skip")]
    stopOld --> startNew
    startNew --> storage
    storage --> broadcast
```

---

## Session Stop Flow

When stopping a session (due to tab switch, navigation, or shutdown):

```mermaid
flowchart LR
    subgraph Input
        trigger["Stop Trigger"]
    end

    subgraph Processing
        getActive["Get Active<br/>Session"]
        calcDuration["Calculate<br/>Duration"]
        createSession["Create Completed<br/>Session Object"]
    end

    subgraph Storage
        updateDomain["Update DomainData<br/>- totalTime += duration<br/>- sessions.push(session)<br/>- dailyStats[date] += duration"]
        clearActive["Clear activeSession"]
    end

    trigger --> getActive
    getActive -->|exists| calcDuration
    getActive -->|null| X[("No-op")]
    calcDuration --> createSession
    createSession --> updateDomain
    updateDomain --> clearActive
```

---

## Domain Data Accumulation

Each domain maintains aggregated statistics:

```mermaid
flowchart TD
    subgraph Session["Completed Session"]
        duration["duration: 5000ms"]
    end

    subgraph Before["DomainData (before)"]
        totalBefore["totalTime: 60000ms"]
        sessionsBefore["sessions: [s1, s2, ...]"]
        dailyBefore["dailyStats: {'2024-01-15': 30000}"]
    end

    subgraph After["DomainData (after)"]
        totalAfter["totalTime: 65000ms"]
        sessionsAfter["sessions: [s1, s2, ..., newSession]"]
        dailyAfter["dailyStats: {'2024-01-15': 35000}"]
    end

    Session --> |"+= duration"| totalAfter
    Session --> |"push()"| sessionsAfter
    Session --> |"+= duration"| dailyAfter
    Before -.-> After
```

---

## Storage Schema

```mermaid
erDiagram
    STORAGE {
        object domains
        object activeSession
        object settings
        number version
        number installDate
    }

    DOMAINS ||--o{ DOMAIN_DATA : contains
    DOMAIN_DATA {
        number totalTime
        array sessions
        object dailyStats
        number lastAccessed
    }

    DOMAIN_DATA ||--o{ SESSION : contains
    SESSION {
        number startTime
        number endTime
        number duration
        number tabId
        number windowId
    }

    ACTIVE_SESSION {
        string domain
        number startTime
        number tabId
        number windowId
        boolean isPaused
    }

    SETTINGS {
        object pillPosition
        boolean pillVisibility
        number dataRetentionDays
        array excludedDomains
    }
```

---

## Message Flow

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
    BS->>RT: sendMessage(tabId, message)
    RT->>CS: onMessage
    CS->>CS: broadcastToComponents()
    CS->>TDP: onSessionUpdate(state)
    TDP->>TDP: Start animation loop
```

---

## Data Lifecycle

| Phase | Location | Data | Description |
|-------|----------|------|-------------|
| **Active** | Memory + Storage | `ActiveSession` | Currently tracking session with `startTime` |
| **Completed** | Storage | `Session` | Finished session with calculated `duration` |
| **Aggregated** | Storage | `DomainData` | Accumulated stats per domain |
| **Displayed** | UI | `SessionState` | Current elapsed time for display |

---

## Timing Precision

- **startTime**: Uses `performance.now()` for sub-millisecond precision
- **duration**: Calculated as `endTime - startTime`
- **currentTime**: Updated via `requestAnimationFrame` in TimeDisplayPill
- **dailyStats**: Keyed by ISO date string (`YYYY-MM-DD`)

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
        domains["domains"]
        activeSession["activeSession"]
    end

    useEffect -->|"storage.get()"| Storage
    Storage -->|"DomainData"| state
    activeSession -->|"ActiveSession"| state
```
