import type { TimeInterval } from "./types";

export function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function subtractIntervals(base: TimeInterval[], busy: TimeInterval[]): TimeInterval[] {
  if (busy.length === 0) return base;
  const sortedBusy = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: TimeInterval[] = [];

  for (const segment of base) {
    let cursor = segment.start;
    for (const b of sortedBusy) {
      if (!overlaps(segment, b)) continue;
      if (b.start > cursor) {
        result.push({ start: cursor, end: b.start });
      }
      if (b.end > cursor) cursor = b.end;
      if (cursor >= segment.end) break;
    }
    if (cursor < segment.end) {
      result.push({ start: cursor, end: segment.end });
    }
  }

  return result.filter((x) => x.end > x.start);
}
