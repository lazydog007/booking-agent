import { bookingRequestSchema } from "@booking-agent/shared";
import { NextResponse } from "next/server";
import { schedulingService } from "../../_lib/services";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = bookingRequestSchema.parse(body);
    const appointmentReason = input.reason_for_appointment ?? input.reason_for_visit;

    const appointment = await schedulingService.createBooking({
      tenantId: input.tenant_id,
      client: {
        phone: input.client.phone_e164,
        name: input.client.name,
        ...(input.client.email ? { email: input.client.email } : {})
      },
      appointmentTypeId: input.appointment_type_id,
      resourceId: input.resource_id,
      slotStartAt: input.selected_slot.start_at,
      ...(appointmentReason ? { reasonForVisit: appointmentReason } : {})
    });

    return NextResponse.json(
      {
        appointment_id: appointment.id,
        status: appointment.status,
        confirmation_text_payload: {
          local_time: new Date(appointment.startAt).toLocaleString(),
          location: "Configured in tenant settings",
          policy_summary: "Policy configured per tenant"
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
