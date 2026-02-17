import { and, eq } from "drizzle-orm";
import { db, scheduleExceptions } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModifySession } from "../../../_lib/authz";

const schema = z.object({
  resource_id: z.string().uuid(),
  rows: z.array(
    z.object({
      date_local: z.string(),
      is_closed: z.boolean(),
      start_local_time: z.string().optional(),
      end_local_time: z.string().optional(),
      label: z.string().optional()
    })
  )
});

export async function PUT(req: Request) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const input = schema.parse(body);

    await db
      .delete(scheduleExceptions)
      .where(and(eq(scheduleExceptions.tenantId, auth.session.user.tenant_id), eq(scheduleExceptions.resourceId, input.resource_id)));

    const inserted = await db
      .insert(scheduleExceptions)
      .values(
        input.rows.map((row) => ({
          tenantId: auth.session.user.tenant_id,
          resourceId: input.resource_id,
          dateLocal: row.date_local,
          isClosed: row.is_closed,
          ...(row.start_local_time ? { startLocalTime: row.start_local_time } : {}),
          ...(row.end_local_time ? { endLocalTime: row.end_local_time } : {}),
          ...(row.label ? { label: row.label } : {})
        }))
      )
      .returning();

    return NextResponse.json({ exceptions: inserted }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
