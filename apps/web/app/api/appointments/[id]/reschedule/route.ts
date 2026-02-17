import { NextResponse } from "next/server";
import { z } from "zod";
import { schedulingService } from "../../../_lib/services";

const rescheduleSchema = z.object({
  tenant_id: z.string().uuid(),
  appointment_type_id: z.string().uuid(),
  new_slot_start_at: z.string().datetime({ offset: true }),
  previous_appointment_id: z.string().uuid().optional()
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = rescheduleSchema.parse(body);

    const rescheduled = await schedulingService.rescheduleBooking(
      input.tenant_id,
      id,
      input.appointment_type_id,
      input.new_slot_start_at,
      input.previous_appointment_id
    );

    return NextResponse.json(
      {
        appointment_id: rescheduled.id,
        status: rescheduled.status,
        new_start_at: rescheduled.startAt,
        old_start_at: input.previous_appointment_id ? undefined : null
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
