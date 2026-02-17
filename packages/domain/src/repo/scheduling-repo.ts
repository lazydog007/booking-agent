import { and, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import {
  appointmentTypes,
  appointments,
  busyBlocks,
  clients,
  resources,
  schedules,
  scheduleExceptions,
  tenants,
  type DbClient
} from "@booking-agent/db";
import type { TimeInterval } from "../availability/types";

export class SchedulingRepository {
  constructor(private readonly db: DbClient) {}

  async getTenant(tenantId: string) {
    const row = await this.db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    if (!row) throw new Error("Tenant not found");
    return row;
  }

  async getAppointmentType(tenantId: string, appointmentTypeId: string) {
    const row = await this.db.query.appointmentTypes.findFirst({
      where: and(eq(appointmentTypes.id, appointmentTypeId), eq(appointmentTypes.tenantId, tenantId), eq(appointmentTypes.isActive, true))
    });
    if (!row) throw new Error("Appointment type not found");
    return row;
  }

  async getDefaultResource(tenantId: string) {
    const row = await this.db.query.resources.findFirst({
      where: and(eq(resources.tenantId, tenantId), eq(resources.isDefault, true), eq(resources.isActive, true))
    });
    if (!row) throw new Error("Default resource not found");
    return row;
  }

  async getWorkingSegments(resourceId: string, tenantId: string, dayStart: Date, dayEnd: Date): Promise<TimeInterval[]> {
    const weekday = dayStart.getUTCDay();

    const rules = await this.db
      .select({ start: schedules.startLocalTime, end: schedules.endLocalTime })
      .from(schedules)
      .where(and(eq(schedules.tenantId, tenantId), eq(schedules.resourceId, resourceId), eq(schedules.weekday, weekday), eq(schedules.isWorking, true)));

    if (rules.length === 0) {
      return [];
    }

    return rules.map((r) => {
      const [startH, startM] = r.start.split(":").map(Number);
      const [endH, endM] = r.end.split(":").map(Number);
      const start = new Date(dayStart);
      start.setUTCHours(startH ?? 0, startM ?? 0, 0, 0);
      const end = new Date(dayStart);
      end.setUTCHours(endH ?? 0, endM ?? 0, 0, 0);
      if (end <= start) return { start: dayStart, end: dayEnd };
      return { start, end };
    });
  }

  async getBusySegments(resourceId: string, tenantId: string, dayStart: Date, dayEnd: Date): Promise<TimeInterval[]> {
    const busyFromBlocks = await this.db
      .select({ start: busyBlocks.startAt, end: busyBlocks.endAt })
      .from(busyBlocks)
      .where(
        and(
          eq(busyBlocks.tenantId, tenantId),
          eq(busyBlocks.resourceId, resourceId),
          lte(busyBlocks.startAt, dayEnd),
          gte(busyBlocks.endAt, dayStart)
        )
      );

    const busyFromAppointments = await this.db
      .select({ start: appointments.startAt, end: appointments.endAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.resourceId, resourceId),
          inArray(appointments.status, ["hold", "booked"]),
          lte(appointments.startAt, dayEnd),
          gte(appointments.endAt, dayStart)
        )
      );

    return [...busyFromBlocks, ...busyFromAppointments].map((x) => ({ start: x.start, end: x.end }));
  }

  async getOrCreateClient(tenantId: string, payload: { phone: string; name: string; email?: string | undefined }) {
    const existing = await this.db.query.clients.findFirst({
      where: and(eq(clients.tenantId, tenantId), eq(clients.phoneE164, payload.phone))
    });
    if (existing) return existing;

    const inserted = await this.db
      .insert(clients)
      .values({
        tenantId,
        phoneE164: payload.phone,
        name: payload.name,
        ...(payload.email ? { email: payload.email } : {})
      })
      .returning();
    return inserted[0]!;
  }

  async createAppointmentTx(input: {
    tenantId: string;
    clientId: string;
    resourceId: string;
    appointmentTypeId: string;
    status: "hold" | "booked";
    startAt: Date;
    endAt: Date;
    holdExpiresAt?: Date;
    bufferBeforeMin: number;
    bufferAfterMin: number;
    reasonForVisit?: string;
  }) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(appointments)
        .values({
          tenantId: input.tenantId,
          clientId: input.clientId,
          resourceId: input.resourceId,
          appointmentTypeId: input.appointmentTypeId,
          status: input.status,
          startAt: input.startAt,
          endAt: input.endAt,
          bufferBeforeMin: input.bufferBeforeMin,
          bufferAfterMin: input.bufferAfterMin,
          ...(input.holdExpiresAt ? { holdExpiresAt: input.holdExpiresAt } : {}),
          ...(input.reasonForVisit ? { reasonForVisit: input.reasonForVisit } : {})
        })
        .returning();
      return rows[0]!;
    });
  }

  async cancelAppointment(tenantId: string, appointmentId: string, reason?: string) {
    const rows = await this.db
      .update(appointments)
      .set({ status: "canceled", canceledAt: new Date(), cancelReason: reason ?? "client_requested", updatedAt: new Date() })
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId), ne(appointments.status, "canceled")))
      .returning();
    return rows[0];
  }

  async updateAppointmentStart(
    tenantId: string,
    appointmentId: string,
    startAt: Date,
    endAt: Date,
    rescheduledFromAppointmentId?: string
  ) {
    const rows = await this.db
      .update(appointments)
      .set({ startAt, endAt, updatedAt: new Date(), ...(rescheduledFromAppointmentId ? { rescheduledFromAppointmentId } : {}) })
      .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId), eq(appointments.status, "booked")))
      .returning();
    return rows[0];
  }
}
