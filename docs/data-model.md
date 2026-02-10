### Schemas:
```
activeTab {
    domain: string
    totalTime: int
    active: bool
    lastVisited: int // used to show time when a domain became active
    lastTimerCheck: timestamp // handles checkpoints when hours/days elapse
}

History {
    earliest: days[0]
    latest: days[length - 1]
    days: set(Day)

    //methods
    clearExpired() // pop any older than settings.dataRetentionDays
    push() <latest>
    pop() <earliest>
}

Day {
    totalTime: int
    hours: [24 * Hour]
    domains: {
        [domain]: {
            totalTime: int
            visitCount: int
            lastVisited: timestamp
            lastTimerCheck: timestamp
        }
    }
    timeStamp: timestamp // used to track time shifts
    shiftedHours: {
        [hour, shift]: Hour
    }
}

Hour {
    domains: {
        [domain]: {
            totalTime: int
            visitCount: int
        }
    }
}

// this is just the schema used to contain domain aggregations
activeDomains {
    [domain]: {
        totalTime: int
        visitCount: int
        lastVisited: timestamp
        lastTimerCheck: timestamp
    }
}

Aggregations:
- Domain
    - totalTime
    - visitCount
- Hour
    - totalTime (across all domains)
    - domains
        - totalTime
        - visitCount
- Day
    - totalTime (across all domains)
    - domains
        - totalTime
        - visitCount
- 30 day history
    - totalTime (across all domains and days)
    - domains
        - totalTime
        - visitCount
```
### Key Lifecycle Events:
- TabEnter
- TabExit
- SecondElapsed
- HourElapsed
- DayElapsed
- TimeChanged
- Clear expired days

### Dataflow:
```
- TabEnter
    ActiveTab:
        domain -> tab domain
        active -> true
        lastVisited -> now
        lastTimerCheck -> now
    History:
        days:
            - remove any days that are past 30 days old (clearExpired())
            - push() new day if today != last day
            [day]:
                hours[now's hour]:
                    domains[tab domain]:
                        totalTime -> 0 if domain is new
                        visitCount -> 1 if domains new, +1 otherwise
                domains[tab domain]:
                    totalTime -> 0 if domain is new
                    lastVisited -> now
                    visitCount -> 1 if domains new, +1 otherwise
                    lastTimerCheck -> now

- TabExit
    - determine if day has elapsed
    calculate timeCheck: now
    calculate timeDelta: timeCheck - activeTab.lastTimerCheck
    ActiveTab:
        totalTime += timeDelta
        active -> false
        lastTimerCheck -> timeCheck
    History:
        days:
            - remove any days that are past 30 days old (clearExpired())
            totalTime += timeDelta
            [day]:
                domains[activeTab]:
                    totalTime += timeDelta
                    lastTimerCheck -> timeCheck
                hours[now's hour]:
                    domains[tab domain]:
                        totalTime += timeDelta

- SecondElapsed
    TimerPill time -> activeTab.totalTime + now - lastTimerCheck

- HourElapsed
    - determine if day has elapsed // ensure aggregation calculations are not duplicated
    timeCheck = now if activeTab.active else null
    calculate timeDelta: now - activeTab.lastTimerCheck if activeTab.active else 0
    ActiveTab:
        totalTime += timeDelta
        lastTimerCheck -> timeCheck
    History:
        days:
            - remove any days that are past 30 days old (clearExpired())
            totalTime += timeDelta
            [day]:
                domains[activeTab]:
                    totalTime += timeDelta
                    lastTimerCheck -> timeCheck
                hours[now's hour]: // make sure to edit the hour that was elapsed
                    domains[activeTab]:
                        totalTime += timeDelta

- DayElapsed
    (Occurs at device's timezone's 00:00—not the default of GMT)
    calculate timeCheck = now if activeTab.active else null
    calculate timeDelta = now - activeTab.lastTimerCheck if activeTab.active else 0
    History:
        days:
            - remove any days that are older than 30 days (clearExpired())
            [day<prev>]:
                hours[now's hour]:
                    domains[activeTab]:
                        totalTime += timeDelta
            - push new day

- ClearExpiredDays
    while History.days.earliest().timestamp is more than retentionDays away from now, pop it

- TimeChanged // this can probably be calculated in the hourElapsed and secondElapsed operations
    shift = now - currentTimestamp (seeded by day's timestamp)
    if shift < 0:
        ensure any timer updates for today are placed in shiftedHours: [now, shift]

// extra notes:
- need to account for time changes (timezone, dst, manual, error)
    - track a setInterval to get the delta for  what a time would have been vs what the time is now to use in calculations
    - keep track of the time shift for the day (for logging), and reset when dayElapses
- make sure dayElapsed is set to occur at the device's timezone's 00:00
```
