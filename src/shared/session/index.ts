import type {
  Day,
  HourData,
  HourTimesAggregate,
  Hours24Tuple,
} from "../../../types";

function aggregateHourTime(hourData: HourData | null | undefined): number {
  if (!hourData?.domains) {
    return 0;
  }
  return Object.values(hourData.domains).reduce(
    (sum, domain) => sum + (domain?.totalTime ?? 0),
    0
  );
}

function createEmptyHourTimes(): HourTimesAggregate {
  return {
    hours: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ] as Hours24Tuple,
  };
}

export function extractHourTimes(day: Day | null): HourTimesAggregate {
  if (!day?.hours) {
    return createEmptyHourTimes();
  }

  const hours = createEmptyHourTimes().hours;

  for (let i = 0; i < 24; i++) {
    const hourData = day.hours[i];
    // Prefer pre-computed totalTime, fall back to aggregating from domains
    hours[i] = hourData?.totalTime ?? aggregateHourTime(hourData);
  }

  return { hours };
}
