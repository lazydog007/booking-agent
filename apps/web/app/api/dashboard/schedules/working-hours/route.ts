import { and, eq } from "drizzle-orm";
import { db, schedules } from "@booking-agent/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModifySession } from "../../../_lib/authz";

const schema = z.object({
  resource_id: z.string().uuid(),
  rows: z.array(
    z.object({
      weekday: z.number().min(0).max(6),
      start_local_time: z.string(),
      end_local_time: z.string(),
      is_working: z.boolean().default(true)
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
      .delete(schedules)
      .where(and(eq(schedules.tenantId, auth.session.user.tenant_id), eq(schedules.resourceId, input.resource_id)));

    const inserted = await db
      .insert(schedules)
      .values(
        input.rows.map((row) => ({
          tenantId: auth.session.user.tenant_id,
          resourceId: input.resource_id,
          weekday: row.weekday,
          startLocalTime: row.start_local_time,
          endLocalTime: row.end_local_time,
          isWorking: row.is_working
        }))
      )
      .returning();

    return NextResponse.json({ schedules: inserted }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
