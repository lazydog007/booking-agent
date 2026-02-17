import { and, eq } from "drizzle-orm";
import { appointmentTypes, db } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../_lib/authz";

export async function GET() {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const rows = await db
      .select()
      .from(appointmentTypes)
      .where(and(eq(appointmentTypes.tenantId, auth.session.user.tenant_id), eq(appointmentTypes.isActive, true)));

    return NextResponse.json({ appointment_types: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
