export type TimeInterval = {
  start: Date;
  end: Date;
};

export type PreferenceWindow = {
  time_of_day?: "morning" | "afternoon" | "evening" | "any";
  earliest_local?: string;
  latest_local?: string;
};

export type AvailabilityInput = {
  tenantId: string;
  appointmentTypeId: string;
  resourceId: string;
  dateRange: { start: string; end: string };
  preferenceWindow?: PreferenceWindow;
  timezone: string;
  granularityMinutes: number;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  leadTimeMinutes: number;
};

export type CandidateSlot = {
  startAt: Date;
  endAt: Date;
  resourceId: string;
  score: number;
};
