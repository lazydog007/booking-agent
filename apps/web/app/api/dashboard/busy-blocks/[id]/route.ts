import { and, eq } from "drizzle-orm";
import { busyBlocks, db } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModifySession } from "../../../_lib/authz";

const patchSchema = z.object({
  start_at: z.string().datetime({ offset: true }).optional(),
  end_at: z.string().datetime({ offset: true }).optional(),
  reason: z.string().optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const input = patchSchema.parse(body);

    const updates: Record<string, unknown> = {};
    if (input.start_at) updates.startAt = new Date(input.start_at);
    if (input.end_at) updates.endAt = new Date(input.end_at);
    if (typeof input.reason === "string") updates.reason = input.reason;

    const updated = await db
      .update(busyBlocks)
      .set(updates)
      .where(and(eq(busyBlocks.id, id), eq(busyBlocks.tenantId, auth.session.user.tenant_id)))
      .returning();

    if (!updated[0]) return NextResponse.json({ error: "busy block not found" }, { status: 404 });
    return NextResponse.json({ busy_block: updated[0] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const deleted = await db
      .delete(busyBlocks)
      .where(and(eq(busyBlocks.id, id), eq(busyBlocks.tenantId, auth.session.user.tenant_id)))
      .returning({ id: busyBlocks.id });

    if (!deleted[0]) return NextResponse.json({ error: "busy block not found" }, { status: 404 });
    return NextResponse.json({ id: deleted[0].id }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
