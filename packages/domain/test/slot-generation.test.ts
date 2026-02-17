import { describe, expect, it } from "vitest";
import { generateCandidateSlots } from "../src/availability/slot-generation";

describe("generateCandidateSlots", () => {
  it("respects busy intervals and returns ranked slots", () => {
    const dayStart = new Date("2026-02-20T14:00:00.000Z");
    const dayEnd = new Date("2026-02-20T20:00:00.000Z");

    const slots = generateCandidateSlots(
      {
        tenantId: "t",
        appointmentTypeId: "a",
        resourceId: "r",
        dateRange: { start: "2026-02-20", end: "2026-02-20" },
        timezone: "America/New_York",
        granularityMinutes: 30,
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        leadTimeMinutes: 0,
        preferenceWindow: { time_of_day: "morning" }
      },
      [
        {
          workingSegments: [{ start: dayStart, end: dayEnd }],
          busySegments: [{ start: new Date("2026-02-20T15:00:00.000Z"), end: new Date("2026-02-20T16:00:00.000Z") }]
        }
      ],
      new Date("2026-02-20T13:00:00.000Z")
    );

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.some((s) => s.startAt.toISOString() === "2026-02-20T15:00:00.000Z")).toBe(false);
  });
});
