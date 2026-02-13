# ADR-0003: Reference Time Normalization for Timer Pill Display

**Date:** 2026-02-12

**Status:** Accepted

## Context

The timer pill displays three independent time values simultaneously:

1. **Session time**: Duration of the current browsing session on a domain
2. **Total time today**: Cumulative time spent on the domain across all sessions
3. **Clock time**: Current wall-clock time

Each time value originates from different sources:
- Session time is calculated from `now - sessionStartTime`
- Total time is read from storage (accumulated historical value)
- Clock time comes directly from `Date.now()`

When rendered together in the UI, these times would naturally have different millisecond offsets. For example, at a given moment:
- Session time might be at 123ms past its current second
- Total time might be at 456ms past its current second
- Clock time might be at 789ms past its current second

This causes **visual stuttering**: the three displayed times don't tick to the next second simultaneously. The user sees one value update, then another a few hundred milliseconds later, then the third. This creates an unpleasant flickering effect that undermines confidence in the tracker's accuracy.

## Decision

Apply **reference time normalization** to synchronize all displayed times to a single millisecond phase:

1. **Single snapshot**: Capture one `Date.now()` timestamp per render frame
2. **Reference phase**: Use the session's `startTime` as the reference for millisecond alignment
3. **Normalize base times**: Adjust session and total time to share the reference's millisecond offset
4. **Same elapsed delta**: Add identical elapsed time to all normalized base values

The normalization function:

```typescript
export function normalizeToReferencePhase(
  referenceTime: number,
  targetTime: number
): number {
  const referenceMillis = referenceTime % 1000;
  const targetSeconds = Math.floor(targetTime / 1000) * 1000;
  return targetSeconds + referenceMillis;
}
```

**How it works:**
- Extract the millisecond component (0-999ms) from the reference time
- Truncate the target time to whole seconds
- Combine them: the target keeps its second count but adopts the reference's millisecond phase

**Example:**
- Reference (`startTime`): 1707750000123 (123ms into its second)
- Target (`baseTotalTime`): 3600456 (456ms into second 3600)
- Result: 3600123 (second 3600 with 123ms phase)

Now both times will tick to the next second at the exact same moment.

## Consequences

### Positive

- **Synchronized ticking**: All three displayed times advance to the next second simultaneously
- **No visual stuttering**: Eliminates the flickering effect that made the UI feel unreliable
- **Simple implementation**: Single utility function, ~5 lines of code
- **No precision loss**: Times remain accurate to the second (milliseconds aren't displayed anyway)
- **Deterministic**: Same inputs always produce same outputs, easy to test

### Negative

- **Millisecond accuracy altered**: The normalized times differ from true elapsed time by up to 999ms
- **Conceptual complexity**: Developers must understand why normalization is needed
- **Coupling to startTime**: If `startTime` is unavailable, must fall back to `Date.now()`

### Neutral

- The clock time display doesn't need normalization since it formats from the same `now` snapshot
- The normalization is invisible to users since milliseconds aren't shown

## Implementation

### Key Files

- `src/shared/utils.ts` - `normalizeToReferencePhase()` function (lines 44-60)
- `src/content/components/TimeDisplayPill.tsx` - Applies normalization in render (lines 95-113)
- `src/shared/utils.test.ts` - Unit tests for normalization function

### Usage Pattern

```typescript
// In TimeDisplayPill component
const now = Date.now();
const startTime = sessionState?.startTime ?? now;
const elapsed = (isActive && !isPaused) ? now - startTime : 0;

// Normalize base times to have same sub-second phase as startTime
const normalizedCurrentTime = normalizeToReferencePhase(
  startTime,
  sessionState?.baseCurrentTime ?? 0
);
const normalizedTotalTime = normalizeToReferencePhase(
  startTime,
  sessionState?.baseTotalTimeToday ?? 0
);

// All times now tick in sync
const displayTime = normalizedCurrentTime + elapsed;
const totalTimeToday = normalizedTotalTime + elapsed;
const clockTime = formatClockTime(new Date(now));
```

### Animation Integration

The pill uses `requestAnimationFrame` for updates (~60fps). Each frame:
1. Captures a single `now` timestamp
2. Calculates `elapsed` once
3. Applies normalization
4. Renders all times from the same snapshot

This ensures zero skew between the three displayed values within any given frame.

## References

- [requestAnimationFrame MDN](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame) - Browser animation API used for smooth updates
