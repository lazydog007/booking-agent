import { and, eq } from "drizzle-orm";
import { db, messages, messageThreads } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { requireDashboardSession } from "../../../../_lib/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ thread_id: string }> }) {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const { thread_id } = await params;

    const thread = await db.query.messageThreads.findFirst({
      where: and(eq(messageThreads.id, thread_id), eq(messageThreads.tenantId, auth.session.user.tenant_id))
    });
    if (!thread) return NextResponse.json({ error: "thread not found" }, { status: 404 });

    const rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.threadId, thread_id), eq(messages.tenantId, auth.session.user.tenant_id)));
    return NextResponse.json({ messages: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
