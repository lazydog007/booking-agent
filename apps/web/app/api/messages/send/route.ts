import { sendWhatsAppMessage } from "@booking-agent/integrations";
import { db, clients, messageThreads, messages, whatsappChannels, whatsappIntegrations } from "@booking-agent/db";
import { decryptSecret } from "@booking-agent/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireDashboardSession } from "../../_lib/authz";

const sendSchema = z.object({
  thread_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
  to_phone: z.string(),
  text: z.string().min(1)
})
.refine((value) => Boolean(value.thread_id || value.channel_id), {
  message: "thread_id or channel_id is required"
});

export async function POST(req: Request) {
  try {
    const auth = await requireDashboardSession();
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const input = sendSchema.parse(body);
    const tenantId = auth.session.user.tenant_id;

    let channelId = input.channel_id ?? null;
    let threadId = input.thread_id ?? null;

    if (threadId) {
      const thread = await db.query.messageThreads.findFirst({
        where: and(eq(messageThreads.id, threadId), eq(messageThreads.tenantId, tenantId))
      });
      if (!thread) {
        return NextResponse.json({ error: "thread not found" }, { status: 404 });
      }
      if (thread.channel !== "whatsapp") {
        return NextResponse.json({ error: "thread is not whatsapp" }, { status: 400 });
      }
      if (!thread.whatsappChannelId) {
        return NextResponse.json({ error: "thread missing whatsapp channel" }, { status: 400 });
      }
      channelId = thread.whatsappChannelId;
    }

    if (!channelId) {
      return NextResponse.json({ error: "unable to resolve whatsapp channel" }, { status: 400 });
    }

    const [channelRow] = await db
      .select({
        channelId: whatsappChannels.id,
        phoneNumberId: whatsappChannels.phoneNumberId,
        integrationToken: whatsappIntegrations.systemUserTokenEncrypted,
        integrationStatus: whatsappIntegrations.status
      })
      .from(whatsappChannels)
      .innerJoin(
        whatsappIntegrations,
        and(
          eq(whatsappIntegrations.id, whatsappChannels.integrationId),
          eq(whatsappIntegrations.tenantId, whatsappChannels.tenantId)
        )
      )
      .where(and(eq(whatsappChannels.id, channelId), eq(whatsappChannels.tenantId, tenantId), eq(whatsappChannels.isActive, true)))
      .limit(1);

    if (!channelRow || channelRow.integrationStatus !== "active") {
      return NextResponse.json({ error: "active whatsapp channel not found" }, { status: 404 });
    }
    if (!channelRow.integrationToken) {
      return NextResponse.json({ error: "channel credentials missing token" }, { status: 400 });
    }

    const accessToken = decryptSecret(channelRow.integrationToken);

    if (!threadId) {
      const [client] = await db
        .insert(clients)
        .values({
          tenantId,
          phoneE164: input.to_phone,
          name: input.to_phone
        })
        .onConflictDoUpdate({
          target: [clients.tenantId, clients.phoneE164],
          set: { updatedAt: new Date() }
        })
        .returning({ id: clients.id });
      if (!client) {
        return NextResponse.json({ error: "failed to resolve client" }, { status: 500 });
      }

      const [thread] = await db
        .insert(messageThreads)
        .values({
          tenantId,
          channel: "whatsapp",
          clientId: client.id,
          whatsappChannelId: channelId
        })
        .onConflictDoUpdate({
          target: [messageThreads.tenantId, messageThreads.channel, messageThreads.clientId],
          set: { whatsappChannelId: channelId, updatedAt: new Date() }
        })
        .returning({ id: messageThreads.id });
      if (!thread) {
        return NextResponse.json({ error: "failed to resolve thread" }, { status: 500 });
      }
      threadId = thread.id;
    }

    const providerResult = await sendWhatsAppMessage({
      phoneNumberId: channelRow.phoneNumberId,
      accessToken,
      to: input.to_phone,
      text: input.text
    });

    const providerMessageId = providerResult.messages?.[0]?.id ?? null;
    if (threadId) {
      await db.insert(messages).values({
        tenantId,
        threadId,
        direction: "outbound",
        text: input.text,
        providerMessageId,
        rawPayload: providerResult,
        deliveryStatus: "sent",
        sentAt: new Date()
      });
    }

    return NextResponse.json(
      {
        message_id: crypto.randomUUID(),
        thread_id: threadId,
        provider_message_id: providerMessageId,
        status: "sent",
        channel_id: channelId
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
