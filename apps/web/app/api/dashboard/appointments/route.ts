import { and, eq, gt, lt } from "drizzle-orm";
import { appointments, db } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../_lib/authz";

export async function GET(req: Request) {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const url = new URL(req.url);
    const resourceId = url.searchParams.get("resource_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    const filters = [
      eq(appointments.tenantId, auth.session.user.tenant_id),
      lt(appointments.startAt, new Date(to)),
      gt(appointments.endAt, new Date(from))
    ];
    if (resourceId) filters.push(eq(appointments.resourceId, resourceId));

    const rows = await db.select().from(appointments).where(and(...filters));

    return NextResponse.json({ appointments: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
