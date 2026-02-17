import { and, eq, lte } from "drizzle-orm";
import { appointments, db } from "@booking-agent/db";

export async function cleanupExpiredHolds(now = new Date()) {
  const rows = await db
    .update(appointments)
    .set({ status: "canceled", cancelReason: "hold_expired", canceledAt: now, updatedAt: now })
    .where(and(eq(appointments.status, "hold"), lte(appointments.holdExpiresAt, now)))
    .returning({ id: appointments.id });

  return rows.length;
}
