import type {
  Day,
  HourData,
  HourTimesAggregate,
  Hours24Tuple,
} from "../../../types";

function aggregateHourTime(hourData: HourData): number {
  return Object.values(hourData.domains).reduce(
    (sum, domain) => sum + domain.totalTime,
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
    hours[i] = day.hours[i]?.totalTime ?? aggregateHourTime(day.hours[i]);
  }

  return { hours };
}
