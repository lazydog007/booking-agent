import { and, eq } from "drizzle-orm";
import { clients, db } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../../_lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const row = await db.query.clients.findFirst({
      where: and(eq(clients.id, id), eq(clients.tenantId, auth.session.user.tenant_id))
    });

    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ client: row }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
