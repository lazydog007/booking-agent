import { DateTime } from "luxon";
import { generateCandidateSlots } from "../availability/slot-generation";
import type { AvailabilityInput } from "../availability/types";
import { SchedulingRepository } from "../repo/scheduling-repo";

export class SchedulingService {
  constructor(private readonly repo: SchedulingRepository) {}

  async getAvailability(input: {
    tenantId: string;
    appointmentTypeId: string;
    resourceId?: string;
    dateRange: { start: string; end: string };
    preferenceWindow?: AvailabilityInput["preferenceWindow"];
    clientTimezone?: string;
  }) {
    const tenant = await this.repo.getTenant(input.tenantId);
    const appointmentType = await this.repo.getAppointmentType(input.tenantId, input.appointmentTypeId);
    const resource = input.resourceId
      ? { id: input.resourceId }
      : await this.repo.getDefaultResource(input.tenantId);

    const timezone = input.clientTimezone ?? tenant.timezone;
    const startDay = DateTime.fromISO(input.dateRange.start, { zone: timezone }).startOf("day");
    const endDay = DateTime.fromISO(input.dateRange.end, { zone: timezone }).endOf("day");

    const dailyPayloads: Array<{ workingSegments: { start: Date; end: Date }[]; busySegments: { start: Date; end: Date }[] }> = [];

    let cursor = startDay;
    while (cursor <= endDay) {
      const dayStart = cursor.toUTC().toJSDate();
      const dayEnd = cursor.endOf("day").toUTC().toJSDate();
      const workingSegments = await this.repo.getWorkingSegments(resource.id, input.tenantId, dayStart, dayEnd);
      const busySegments = await this.repo.getBusySegments(resource.id, input.tenantId, dayStart, dayEnd);
      dailyPayloads.push({ workingSegments, busySegments });
      cursor = cursor.plus({ days: 1 });
    }

    const slots = generateCandidateSlots(
      {
        tenantId: input.tenantId,
        appointmentTypeId: input.appointmentTypeId,
        resourceId: resource.id,
        dateRange: input.dateRange,
        timezone,
        granularityMinutes: tenant.slotGranularityMinutes,
        durationMinutes: appointmentType.durationMinutes,
        bufferBeforeMinutes: appointmentType.bufferBeforeMinutes,
        bufferAfterMinutes: appointmentType.bufferAfterMinutes,
        leadTimeMinutes: Number((tenant.settings as any)?.leadTimeMinutes ?? 60),
        ...(input.preferenceWindow ? { preferenceWindow: input.preferenceWindow } : {})
      },
      dailyPayloads
    );

    return {
      slots: slots.map((s) => ({ start_at: s.startAt.toISOString(), end_at: s.endAt.toISOString(), resource_id: s.resourceId })),
      reason_codes: slots.length ? [] : ["NO_CAPACITY_IN_WINDOW", "SUGGEST_EXPAND_DATE_RANGE"]
    };
  }

  async createBooking(input: {
    tenantId: string;
    client: { phone: string; name: string; email?: string | undefined };
    appointmentTypeId: string;
    resourceId: string;
    slotStartAt: string;
    reasonForVisit?: string;
  }) {
    const appointmentType = await this.repo.getAppointmentType(input.tenantId, input.appointmentTypeId);
    const client = await this.repo.getOrCreateClient(input.tenantId, input.client);

    const startAt = new Date(input.slotStartAt);
    const endAt = new Date(startAt.getTime() + appointmentType.durationMinutes * 60_000);

    const booking = await this.repo.createAppointmentTx({
      tenantId: input.tenantId,
      clientId: client.id,
      resourceId: input.resourceId,
      appointmentTypeId: input.appointmentTypeId,
      status: "booked",
      startAt,
      endAt,
      bufferBeforeMin: appointmentType.bufferBeforeMinutes,
      bufferAfterMin: appointmentType.bufferAfterMinutes,
      ...(input.reasonForVisit ? { reasonForVisit: input.reasonForVisit } : {})
    });

    return booking;
  }

  async createHold(input: {
    tenantId: string;
    client: { phone: string; name: string; email?: string | undefined };
    appointmentTypeId: string;
    resourceId: string;
    slotStartAt: string;
    ttlMinutes: number;
  }) {
    const appointmentType = await this.repo.getAppointmentType(input.tenantId, input.appointmentTypeId);
    const client = await this.repo.getOrCreateClient(input.tenantId, input.client);

    const startAt = new Date(input.slotStartAt);
    const endAt = new Date(startAt.getTime() + appointmentType.durationMinutes * 60_000);

    return this.repo.createAppointmentTx({
      tenantId: input.tenantId,
      clientId: client.id,
      resourceId: input.resourceId,
      appointmentTypeId: input.appointmentTypeId,
      status: "hold",
      startAt,
      endAt,
      holdExpiresAt: new Date(Date.now() + input.ttlMinutes * 60_000),
      bufferBeforeMin: appointmentType.bufferBeforeMinutes,
      bufferAfterMin: appointmentType.bufferAfterMinutes
    });
  }

  async cancelBooking(tenantId: string, appointmentId: string, reason?: string) {
    const canceled = await this.repo.cancelAppointment(tenantId, appointmentId, reason);
    if (!canceled) throw new Error("Appointment not found or already canceled");
    return canceled;
  }

  async rescheduleBooking(
    tenantId: string,
    appointmentId: string,
    appointmentTypeId: string,
    newSlotStartAt: string,
    previousAppointmentId?: string
  ) {
    const appointmentType = await this.repo.getAppointmentType(tenantId, appointmentTypeId);
    const startAt = new Date(newSlotStartAt);
    const endAt = new Date(startAt.getTime() + appointmentType.durationMinutes * 60_000);
    const updated = await this.repo.updateAppointmentStart(tenantId, appointmentId, startAt, endAt, previousAppointmentId);
    if (!updated) throw new Error("Unable to reschedule appointment");
    return updated;
  }
}
