import { NextResponse } from "next/server";
import { z } from "zod";
import { schedulingService } from "../../../../_lib/services";
import { requireModifySession } from "../../../../_lib/authz";

const schema = z.object({
  appointment_type_id: z.string().uuid(),
  new_slot_start_at: z.string().datetime({ offset: true }),
  previous_appointment_id: z.string().uuid().optional()
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const input = schema.parse(body);

    const rescheduled = await schedulingService.rescheduleBooking(
      auth.session.user.tenant_id,
      id,
      input.appointment_type_id,
      input.new_slot_start_at,
      input.previous_appointment_id
    );

    return NextResponse.json(
      {
        appointment_id: rescheduled.id,
        status: rescheduled.status,
        new_start_at: rescheduled.startAt
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
