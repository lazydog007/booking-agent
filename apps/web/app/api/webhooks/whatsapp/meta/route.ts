import {
  deriveWebhookEventKey,
  extractPhoneNumberIdsFromWebhook,
  normalizeInboundPayload,
  verifyMetaSignatureAny
} from "@booking-agent/integrations";
import { db, webhookEventsInbox, whatsappChannels, whatsappIntegrations } from "@booking-agent/db";
import { decryptSecret } from "@booking-agent/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    const payload = JSON.parse(raw);
    const phoneNumberIds = extractPhoneNumberIdsFromWebhook(payload);

    const integrationRows =
      phoneNumberIds.length > 0
        ? await db
            .select({ appSecret: whatsappIntegrations.metaAppSecretEncrypted })
            .from(whatsappChannels)
            .innerJoin(
              whatsappIntegrations,
              and(
                eq(whatsappIntegrations.id, whatsappChannels.integrationId),
                eq(whatsappIntegrations.tenantId, whatsappChannels.tenantId)
              )
            )
            .where(
              and(
                inArray(whatsappChannels.phoneNumberId, phoneNumberIds),
                eq(whatsappChannels.isActive, true),
                eq(whatsappIntegrations.status, "active")
              )
            )
        : [];

    const candidateSecrets = [
      process.env.META_APP_SECRET ?? "",
      ...integrationRows
        .map((row) => {
          if (!row.appSecret) return "";
          try {
            return decryptSecret(row.appSecret);
          } catch {
            return "";
          }
        })
        .filter((value) => value.length > 0)
    ].filter((value) => value.length > 0);

    if (!verifyMetaSignatureAny(raw, signature, candidateSecrets)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    const normalizedEvents = normalizeInboundPayload(payload);
    if (normalizedEvents.length === 0) {
      return NextResponse.json({ ok: true, count: 0 }, { status: 200 });
    }

    await db
      .insert(webhookEventsInbox)
      .values(
        normalizedEvents.map((event) => ({
          provider: "meta_whatsapp" as const,
          eventType: event.eventType,
          providerEventKey: deriveWebhookEventKey(event),
          phoneNumberId: event.phoneNumberId,
          payloadJson: event.raw as Record<string, unknown>,
          receivedAt: new Date(event.eventType === "message" ? event.receivedAt : event.timestamp)
        }))
      )
      .onConflictDoNothing({
        target: [webhookEventsInbox.provider, webhookEventsInbox.providerEventKey]
      });

    return NextResponse.json({ ok: true, count: normalizedEvents.length }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
