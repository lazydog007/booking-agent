import { NextResponse } from "next/server";
import { z } from "zod";
import { schedulingService } from "../../../_lib/services";

const cancelSchema = z.object({ tenant_id: z.string().uuid(), reason: z.string().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = cancelSchema.parse(body);

    const canceled = await schedulingService.cancelBooking(input.tenant_id, id, input.reason);
    return NextResponse.json(
      {
        appointment_id: canceled.id,
        status: canceled.status,
        canceled_at: canceled.canceledAt
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
