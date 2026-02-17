import { DateTime } from "luxon";
import { passesLeadTime } from "../policies/rules";
import { subtractIntervals } from "./interval";
import type { AvailabilityInput, CandidateSlot, TimeInterval } from "./types";

export type DailyAvailabilityPayload = {
  workingSegments: TimeInterval[];
  busySegments: TimeInterval[];
};

function alignToGranularity(date: Date, granularityMinutes: number): Date {
  const ms = granularityMinutes * 60_000;
  const aligned = Math.ceil(date.getTime() / ms) * ms;
  return new Date(aligned);
}

function preferenceScore(slot: Date, timezone: string, preference?: AvailabilityInput["preferenceWindow"]): number {
  if (!preference || preference.time_of_day === "any") return 1;
  const hour = DateTime.fromJSDate(slot, { zone: timezone }).hour;
  if (preference.time_of_day === "morning") return hour >= 8 && hour < 12 ? 2 : 0;
  if (preference.time_of_day === "afternoon") return hour >= 12 && hour < 17 ? 2 : 0;
  if (preference.time_of_day === "evening") return hour >= 17 && hour < 21 ? 2 : 0;
  return 1;
}

export function generateCandidateSlots(
  input: AvailabilityInput,
  dailyPayloads: DailyAvailabilityPayload[],
  now = new Date()
): CandidateSlot[] {
  const output: CandidateSlot[] = [];
  const totalSpanMs = (input.durationMinutes + input.bufferBeforeMinutes + input.bufferAfterMinutes) * 60_000;

  for (const day of dailyPayloads) {
    const freeSegments = subtractIntervals(day.workingSegments, day.busySegments);

    for (const free of freeSegments) {
      let cursor = alignToGranularity(free.start, input.granularityMinutes);
      while (cursor.getTime() + totalSpanMs <= free.end.getTime()) {
        const startAt = new Date(cursor);
        const endAt = new Date(cursor.getTime() + input.durationMinutes * 60_000);

        if (passesLeadTime(now, startAt, input.leadTimeMinutes)) {
          const score = preferenceScore(startAt, input.timezone, input.preferenceWindow);
          if (score > 0) {
            output.push({ startAt, endAt, resourceId: input.resourceId, score });
          }
        }

        cursor = new Date(cursor.getTime() + input.granularityMinutes * 60_000);
      }
    }
  }

  return output
    .sort((a, b) => b.score - a.score || a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 5);
}
