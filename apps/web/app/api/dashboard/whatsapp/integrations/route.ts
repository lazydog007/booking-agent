import { db, whatsappIntegrations } from "@booking-agent/db";
import { encryptSecret } from "@booking-agent/shared";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession, requireModifySession } from "../../../_lib/authz";

const createSchema = z.object({
  mode: z.enum(["shared_managed", "bring_your_own"]),
  meta_app_id: z.string().min(1).optional(),
  meta_app_secret: z.string().min(1).optional(),
  system_user_token: z.string().min(1).optional(),
  token_expires_at: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["active", "inactive", "error"]).optional()
});

export async function GET() {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const rows = await db
      .select({
        id: whatsappIntegrations.id,
        tenant_id: whatsappIntegrations.tenantId,
        mode: whatsappIntegrations.mode,
        meta_app_id: whatsappIntegrations.metaAppId,
        token_expires_at: whatsappIntegrations.tokenExpiresAt,
        status: whatsappIntegrations.status,
        last_error: whatsappIntegrations.lastError,
        created_at: whatsappIntegrations.createdAt,
        updated_at: whatsappIntegrations.updatedAt
      })
      .from(whatsappIntegrations)
      .where(eq(whatsappIntegrations.tenantId, auth.session.user.tenant_id))
      .orderBy(desc(whatsappIntegrations.createdAt));

    return NextResponse.json({ integrations: rows }, { status: 200 });
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

    if (input.mode === "bring_your_own" && (!input.meta_app_secret || !input.system_user_token)) {
      return NextResponse.json(
        { error: "bring_your_own mode requires meta_app_secret and system_user_token" },
        { status: 400 }
      );
    }

    if (input.status === "active") {
      await db
        .update(whatsappIntegrations)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(and(eq(whatsappIntegrations.tenantId, tenantId), eq(whatsappIntegrations.status, "active")));
    }

    const [row] = await db
      .insert(whatsappIntegrations)
      .values({
        tenantId,
        mode: input.mode,
        metaAppId: input.meta_app_id ?? null,
        metaAppSecretEncrypted: input.meta_app_secret ? encryptSecret(input.meta_app_secret) : null,
        systemUserTokenEncrypted: input.system_user_token ? encryptSecret(input.system_user_token) : null,
        tokenExpiresAt: input.token_expires_at ? new Date(input.token_expires_at) : null,
        status: input.status ?? "active"
      })
      .returning({
        id: whatsappIntegrations.id,
        tenant_id: whatsappIntegrations.tenantId,
        mode: whatsappIntegrations.mode,
        meta_app_id: whatsappIntegrations.metaAppId,
        token_expires_at: whatsappIntegrations.tokenExpiresAt,
        status: whatsappIntegrations.status,
        last_error: whatsappIntegrations.lastError,
        created_at: whatsappIntegrations.createdAt,
        updated_at: whatsappIntegrations.updatedAt
      });

    return NextResponse.json({ integration: row }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
