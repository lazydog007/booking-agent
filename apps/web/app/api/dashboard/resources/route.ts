import { and, eq } from "drizzle-orm";
import { db, resources } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../_lib/authz";

export async function GET() {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const rows = await db
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, auth.session.user.tenant_id), eq(resources.isActive, true)));

    return NextResponse.json({ resources: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
