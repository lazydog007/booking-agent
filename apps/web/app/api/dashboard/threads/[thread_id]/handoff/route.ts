import { and, eq } from "drizzle-orm";
import { db, messageThreads } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModifySession } from "../../../../_lib/authz";

const schema = z.object({
  assigned_user_id: z.string().uuid().optional()
});

export async function POST(req: Request, { params }: { params: Promise<{ thread_id: string }> }) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const { thread_id } = await params;
    const body = await req.json();
    const input = schema.parse(body);

    const updated = await db
      .update(messageThreads)
      .set({ status: "handoff", assignedUserId: input.assigned_user_id ?? null, updatedAt: new Date() })
      .where(and(eq(messageThreads.id, thread_id), eq(messageThreads.tenantId, auth.session.user.tenant_id)))
      .returning();

    if (!updated[0]) return NextResponse.json({ error: "thread not found" }, { status: 404 });

    return NextResponse.json({ thread: updated[0] }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
