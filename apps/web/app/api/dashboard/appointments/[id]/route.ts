import { and, eq } from "drizzle-orm";
import { appointments, db } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../../_lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const row = await db.query.appointments.findFirst({
      where: and(eq(appointments.id, id), eq(appointments.tenantId, auth.session.user.tenant_id))
    });

    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ appointment: row }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
