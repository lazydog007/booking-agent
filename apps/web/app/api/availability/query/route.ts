import { availabilityQuerySchema } from "@booking-agent/shared";
import { NextResponse } from "next/server";
import { schedulingService } from "../../_lib/services";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = availabilityQuerySchema.parse(body);
    const preferenceWindow = input.preference_window
      ? {
          ...(input.preference_window.time_of_day ? { time_of_day: input.preference_window.time_of_day } : {}),
          ...(input.preference_window.earliest_local ? { earliest_local: input.preference_window.earliest_local } : {}),
          ...(input.preference_window.latest_local ? { latest_local: input.preference_window.latest_local } : {})
        }
      : undefined;

    const result = await schedulingService.getAvailability({
      tenantId: input.tenant_id,
      appointmentTypeId: input.appointment_type_id,
      dateRange: input.date_range,
      ...(input.resource_id ? { resourceId: input.resource_id } : {}),
      ...(preferenceWindow ? { preferenceWindow } : {}),
      ...(input.client_timezone ? { clientTimezone: input.client_timezone } : {})
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
