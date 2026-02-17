import { db, whatsappChannels, whatsappIntegrations } from "@booking-agent/db";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession, requireModifySession } from "../../../_lib/authz";

const createSchema = z.object({
  integration_id: z.string().uuid(),
  phone_number_id: z.string().min(1),
  display_phone_number: z.string().min(1).optional(),
  waba_id: z.string().min(1).optional(),
  quality_rating: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional()
});

export async function GET() {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const tenantId = auth.session.user.tenant_id;
    const rows = await db
      .select({
        id: whatsappChannels.id,
        tenant_id: whatsappChannels.tenantId,
        integration_id: whatsappChannels.integrationId,
        integration_status: whatsappIntegrations.status,
        phone_number_id: whatsappChannels.phoneNumberId,
        display_phone_number: whatsappChannels.displayPhoneNumber,
        waba_id: whatsappChannels.wabaId,
        quality_rating: whatsappChannels.qualityRating,
        is_default: whatsappChannels.isDefault,
        is_active: whatsappChannels.isActive,
        created_at: whatsappChannels.createdAt,
        updated_at: whatsappChannels.updatedAt
      })
      .from(whatsappChannels)
      .innerJoin(
        whatsappIntegrations,
        and(
          eq(whatsappIntegrations.id, whatsappChannels.integrationId),
          eq(whatsappIntegrations.tenantId, whatsappChannels.tenantId)
        )
      )
      .where(eq(whatsappChannels.tenantId, tenantId))
      .orderBy(asc(whatsappChannels.createdAt));

    return NextResponse.json({ channels: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const input = createSchema.parse(body);
    const tenantId = auth.session.user.tenant_id;

    const integration = await db.query.whatsappIntegrations.findFirst({
      where: and(eq(whatsappIntegrations.id, input.integration_id), eq(whatsappIntegrations.tenantId, tenantId))
    });
    if (!integration) {
      return NextResponse.json({ error: "integration not found" }, { status: 404 });
    }

    if (input.is_default) {
      await db
        .update(whatsappChannels)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(whatsappChannels.tenantId, tenantId));
    }

    const [row] = await db
      .insert(whatsappChannels)
      .values({
        tenantId,
        integrationId: input.integration_id,
        phoneNumberId: input.phone_number_id,
        displayPhoneNumber: input.display_phone_number ?? null,
        wabaId: input.waba_id ?? null,
        qualityRating: input.quality_rating ?? null,
        isDefault: input.is_default ?? false,
        isActive: input.is_active ?? true
      })
      .returning();

    return NextResponse.json({ channel: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
