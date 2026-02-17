import { and, eq, gt, lt } from "drizzle-orm";
import { busyBlocks, db } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession, requireModifySession } from "../../_lib/authz";

const schema = z.object({
  resource_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
  reason: z.string().optional()
});

export async function POST(req: Request) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const input = schema.parse(body);

    const inserted = await db
      .insert(busyBlocks)
      .values({
        tenantId: auth.session.user.tenant_id,
        resourceId: input.resource_id,
        startAt: new Date(input.start_at),
        endAt: new Date(input.end_at),
        source: "dashboard",
        ...(input.reason ? { reason: input.reason } : {})
      })
      .returning();

    return NextResponse.json({ busy_block: inserted[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

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
      eq(busyBlocks.tenantId, auth.session.user.tenant_id),
      lt(busyBlocks.startAt, new Date(to)),
      gt(busyBlocks.endAt, new Date(from))
    ];
    if (resourceId) filters.push(eq(busyBlocks.resourceId, resourceId));

    const rows = await db.select().from(busyBlocks).where(and(...filters));
    return NextResponse.json({ busy_blocks: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
