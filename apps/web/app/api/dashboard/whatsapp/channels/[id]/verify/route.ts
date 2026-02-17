import { db, whatsappChannels, whatsappIntegrations } from "@booking-agent/db";
import { decryptSecret } from "@booking-agent/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireModifySession } from "../../../../../_lib/authz";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const tenantId = auth.session.user.tenant_id;

    const [row] = await db
      .select({
        id: whatsappChannels.id,
        phoneNumberId: whatsappChannels.phoneNumberId,
        integrationId: whatsappChannels.integrationId,
        integrationStatus: whatsappIntegrations.status,
        tokenEncrypted: whatsappIntegrations.systemUserTokenEncrypted
      })
      .from(whatsappChannels)
      .innerJoin(
        whatsappIntegrations,
        and(
          eq(whatsappIntegrations.id, whatsappChannels.integrationId),
          eq(whatsappIntegrations.tenantId, whatsappChannels.tenantId)
        )
      )
      .where(and(eq(whatsappChannels.id, id), eq(whatsappChannels.tenantId, tenantId)))
      .limit(1);

    if (!row) return NextResponse.json({ error: "channel not found" }, { status: 404 });
    if (row.integrationStatus !== "active") {
      return NextResponse.json({ error: "integration is not active" }, { status: 400 });
    }
    if (!row.tokenEncrypted) {
      return NextResponse.json({ error: "integration token is missing" }, { status: 400 });
    }

    const accessToken = decryptSecret(row.tokenEncrypted);
    const url = `https://graph.facebook.com/v22.0/${row.phoneNumberId}?fields=id,display_phone_number,quality_rating`; 
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const details = await response.text();
      await db
        .update(whatsappIntegrations)
        .set({ status: "error", lastError: details, updatedAt: new Date() })
        .where(and(eq(whatsappIntegrations.id, row.integrationId), eq(whatsappIntegrations.tenantId, tenantId)));
      return NextResponse.json({ ok: false, error: details }, { status: 400 });
    }

    const payload = await response.json();
    await db
      .update(whatsappChannels)
      .set({
        displayPhoneNumber: payload.display_phone_number ?? null,
        qualityRating: payload.quality_rating ?? null,
        updatedAt: new Date()
      })
      .where(and(eq(whatsappChannels.id, row.id), eq(whatsappChannels.tenantId, tenantId)));

    await db
      .update(whatsappIntegrations)
      .set({ status: "active", lastError: null, updatedAt: new Date() })
      .where(and(eq(whatsappIntegrations.id, row.integrationId), eq(whatsappIntegrations.tenantId, tenantId)));

    return NextResponse.json({ ok: true, channel_info: payload }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
