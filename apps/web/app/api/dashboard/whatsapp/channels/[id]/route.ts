import { db, whatsappChannels, whatsappIntegrations } from "@booking-agent/db";
import { encryptSecret } from "@booking-agent/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireModifySession } from "../../../../_lib/authz";

const patchSchema = z.object({
  display_phone_number: z.string().min(1).optional(),
  waba_id: z.string().min(1).optional(),
  quality_rating: z.string().min(1).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
  integration_id: z.string().uuid().optional(),
  status: z.enum(["active", "inactive", "error"]).optional(),
  meta_app_id: z.string().min(1).optional(),
  meta_app_secret: z.string().min(1).optional(),
  system_user_token: z.string().min(1).optional(),
  token_expires_at: z.string().datetime({ offset: true }).nullable().optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireModifySession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await req.json();
    const input = patchSchema.parse(body);
    const tenantId = auth.session.user.tenant_id;

    const existing = await db.query.whatsappChannels.findFirst({
      where: and(eq(whatsappChannels.id, id), eq(whatsappChannels.tenantId, tenantId))
    });
    if (!existing) return NextResponse.json({ error: "channel not found" }, { status: 404 });

    if (input.is_default) {
      await db
        .update(whatsappChannels)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(whatsappChannels.tenantId, tenantId));
    }

    if (input.integration_id) {
      const integration = await db.query.whatsappIntegrations.findFirst({
        where: and(eq(whatsappIntegrations.id, input.integration_id), eq(whatsappIntegrations.tenantId, tenantId))
      });
      if (!integration) return NextResponse.json({ error: "integration not found" }, { status: 404 });
    }

    const channelUpdates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.integration_id !== undefined) channelUpdates.integrationId = input.integration_id;
    if (input.display_phone_number !== undefined) channelUpdates.displayPhoneNumber = input.display_phone_number;
    if (input.waba_id !== undefined) channelUpdates.wabaId = input.waba_id;
    if (input.quality_rating !== undefined) channelUpdates.qualityRating = input.quality_rating;
    if (input.is_default !== undefined) channelUpdates.isDefault = input.is_default;
    if (input.is_active !== undefined) channelUpdates.isActive = input.is_active;

    const [channel] = await db
      .update(whatsappChannels)
      .set(channelUpdates)
      .where(and(eq(whatsappChannels.id, id), eq(whatsappChannels.tenantId, tenantId)))
      .returning();

    if (!channel) return NextResponse.json({ error: "channel update failed" }, { status: 500 });

    if (
      input.status !== undefined ||
      input.meta_app_id !== undefined ||
      input.meta_app_secret !== undefined ||
      input.system_user_token !== undefined ||
      input.token_expires_at !== undefined
    ) {
      const integration = await db.query.whatsappIntegrations.findFirst({
        where: and(eq(whatsappIntegrations.id, channel.integrationId), eq(whatsappIntegrations.tenantId, tenantId))
      });
      if (!integration) return NextResponse.json({ error: "integration not found" }, { status: 404 });

      const nextSecret =
        input.meta_app_secret !== undefined
          ? encryptSecret(input.meta_app_secret)
          : integration.metaAppSecretEncrypted;
      const nextToken =
        input.system_user_token !== undefined
          ? encryptSecret(input.system_user_token)
          : integration.systemUserTokenEncrypted;

      const integrationUpdates: Record<string, unknown> = {
        metaAppSecretEncrypted: nextSecret,
        systemUserTokenEncrypted: nextToken,
        lastError: null,
        updatedAt: new Date()
      };
      if (input.status !== undefined) integrationUpdates.status = input.status;
      if (input.meta_app_id !== undefined) integrationUpdates.metaAppId = input.meta_app_id;
      if (input.token_expires_at !== undefined) {
        integrationUpdates.tokenExpiresAt = input.token_expires_at === null ? null : new Date(input.token_expires_at);
      }

      await db
        .update(whatsappIntegrations)
        .set(integrationUpdates)
        .where(and(eq(whatsappIntegrations.id, channel.integrationId), eq(whatsappIntegrations.tenantId, tenantId)));
    }

    return NextResponse.json({ channel }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && /Authentication tag|Invalid encrypted secret/.test(error.message)) {
      return NextResponse.json({ error: "stored credentials could not be decrypted" }, { status: 500 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
