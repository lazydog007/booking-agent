export function passesLeadTime(now: Date, slotStart: Date, leadTimeMinutes: number): boolean {
  const minStart = new Date(now.getTime() + leadTimeMinutes * 60_000);
  return slotStart >= minStart;
}

export function canCancel(now: Date, slotStart: Date, minNoticeMinutes: number): boolean {
  return slotStart.getTime() - now.getTime() >= minNoticeMinutes * 60_000;
}
