import { AgentRuntime } from "@booking-agent/agent";
import {
  clients,
  conversationState,
  db,
  messageThreads,
  messages,
  webhookEventsInbox,
  whatsappChannels,
  whatsappIntegrations
} from "@booking-agent/db";
import { sendWhatsAppMessage } from "@booking-agent/integrations";
import { decryptSecret } from "@booking-agent/shared";
import { and, asc, eq, isNull, lt } from "drizzle-orm";

type PendingInboxRow = {
  id: string;
  eventType: "message" | "status" | "other";
  phoneNumberId: string | null;
  payloadJson: Record<string, unknown>;
  attemptCount: number;
};

type ChannelRuntime = {
  tenantId: string;
  channelId: string;
  phoneNumberId: string;
  accessToken: string;
};

const MAX_RETRIES = 5;

function toIsoFromUnixSeconds(raw: unknown): string {
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return new Date(Number(raw) * 1000).toISOString();
  }
  return new Date().toISOString();
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function resolveChannelRuntime(phoneNumberId: string): Promise<ChannelRuntime | null> {
  const [row] = await db
    .select({
      tenantId: whatsappChannels.tenantId,
      channelId: whatsappChannels.id,
      phoneNumberId: whatsappChannels.phoneNumberId,
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
    .where(
      and(
        eq(whatsappChannels.phoneNumberId, phoneNumberId),
        eq(whatsappChannels.isActive, true),
        eq(whatsappIntegrations.status, "active")
      )
    )
    .limit(1);

  if (!row || !row.tokenEncrypted) return null;

  return {
    tenantId: row.tenantId,
    channelId: row.channelId,
    phoneNumberId: row.phoneNumberId,
    accessToken: decryptSecret(row.tokenEncrypted)
  };
}

async function upsertClientAndThread(input: {
  tenantId: string;
  channelId: string;
  fromPhone: string;
}) {
  const [client] = await db
    .insert(clients)
    .values({
      tenantId: input.tenantId,
      phoneE164: input.fromPhone,
      name: input.fromPhone
    })
    .onConflictDoUpdate({
      target: [clients.tenantId, clients.phoneE164],
      set: { updatedAt: new Date() }
    })
    .returning({ id: clients.id, phone: clients.phoneE164 });

  if (!client) throw new Error("Failed to upsert client");

  const [thread] = await db
    .insert(messageThreads)
    .values({
      tenantId: input.tenantId,
      channel: "whatsapp",
      clientId: client.id,
      whatsappChannelId: input.channelId,
      status: "open"
    })
    .onConflictDoUpdate({
      target: [messageThreads.tenantId, messageThreads.channel, messageThreads.clientId],
      set: { whatsappChannelId: input.channelId, updatedAt: new Date() }
    })
    .returning({ id: messageThreads.id });

  if (!thread) throw new Error("Failed to upsert thread");
  return { clientId: client.id, clientPhone: client.phone, threadId: thread.id };
}

async function updateConversationState(input: {
  tenantId: string;
  threadId: string;
  phoneE164: string;
  state: string;
}) {
  await db
    .insert(conversationState)
    .values({
      tenantId: input.tenantId,
      threadId: input.threadId,
      phoneE164: input.phoneE164,
      state: input.state,
      context: {}
    })
    .onConflictDoUpdate({
      target: [conversationState.tenantId, conversationState.phoneE164],
      set: {
        threadId: input.threadId,
        state: input.state,
        updatedAt: new Date()
      }
    });
}

async function processInboundMessage(row: PendingInboxRow) {
  if (!row.phoneNumberId) throw new Error("Missing phone_number_id on message event");

  const runtime = await resolveChannelRuntime(row.phoneNumberId);
  if (!runtime) throw new Error("No active channel/integration found for phone_number_id");

  const providerMessageId = asText(row.payloadJson.id);
  const fromPhone = asText(row.payloadJson.from);
  const textBody = asText((row.payloadJson.text as { body?: unknown } | undefined)?.body);
  const receivedAt = new Date(toIsoFromUnixSeconds(row.payloadJson.timestamp));

  if (!providerMessageId || !fromPhone) {
    throw new Error("Invalid inbound message payload");
  }

  const { threadId, clientPhone } = await upsertClientAndThread({
    tenantId: runtime.tenantId,
    channelId: runtime.channelId,
    fromPhone
  });

  await db
    .insert(messages)
    .values({
      tenantId: runtime.tenantId,
      threadId,
      direction: "inbound",
      text: textBody,
      providerMessageId,
      rawPayload: row.payloadJson,
      deliveryStatus: "received",
      receivedAt
    })
    .onConflictDoNothing({ target: messages.providerMessageId });

  const [currentState] = await db
    .select({ state: conversationState.state, context: conversationState.context })
    .from(conversationState)
    .where(and(eq(conversationState.tenantId, runtime.tenantId), eq(conversationState.phoneE164, clientPhone)))
    .limit(1);

  const agent = new AgentRuntime(async () => ({ ok: true }));
  let reply = "";
  try {
    reply = await agent.respond({
      threadId,
      tenantId: runtime.tenantId,
      userText: textBody,
      state: currentState?.state ?? "NEW",
      context: (currentState?.context as Record<string, unknown>) ?? {}
    });
  } catch {
    reply = "Thanks for your message. A team member will follow up shortly.";
  }

  if (reply.trim().length > 0) {
    const sendResult = await sendWhatsAppMessage({
      phoneNumberId: runtime.phoneNumberId,
      accessToken: runtime.accessToken,
      to: fromPhone,
      text: reply
    });

    await db.insert(messages).values({
      tenantId: runtime.tenantId,
      threadId,
      direction: "outbound",
      text: reply,
      providerMessageId: sendResult.messages?.[0]?.id ?? null,
      rawPayload: sendResult,
      deliveryStatus: "sent",
      sentAt: new Date()
    });
  }

  await updateConversationState({
    tenantId: runtime.tenantId,
    threadId,
    phoneE164: clientPhone,
    state: "IDENTIFY_INTENT"
  });
}

async function processStatusEvent(row: PendingInboxRow) {
  const providerMessageId = asText(row.payloadJson.id);
  const status = asText(row.payloadJson.status);
  if (!providerMessageId || !status) {
    throw new Error("Invalid status payload");
  }

  await db
    .update(messages)
    .set({
      deliveryStatus: status,
      rawPayload: row.payloadJson,
      updatedAt: new Date()
    })
    .where(eq(messages.providerMessageId, providerMessageId));
}

async function processInboxRow(row: PendingInboxRow) {
  switch (row.eventType) {
    case "message":
      return processInboundMessage(row);
    case "status":
      return processStatusEvent(row);
    default:
      return;
  }
}

export async function processWebhookEventsBatch(limit = 20) {
  const pending = await db
    .select({
      id: webhookEventsInbox.id,
      eventType: webhookEventsInbox.eventType,
      phoneNumberId: webhookEventsInbox.phoneNumberId,
      payloadJson: webhookEventsInbox.payloadJson,
      attemptCount: webhookEventsInbox.attemptCount
    })
    .from(webhookEventsInbox)
    .where(and(isNull(webhookEventsInbox.processedAt), lt(webhookEventsInbox.attemptCount, MAX_RETRIES)))
    .orderBy(asc(webhookEventsInbox.receivedAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const row of pending as PendingInboxRow[]) {
    try {
      await processInboxRow(row);
      await db
        .update(webhookEventsInbox)
        .set({
          processedAt: new Date(),
          attemptCount: row.attemptCount + 1,
          lastError: null,
          updatedAt: new Date()
        })
        .where(eq(webhookEventsInbox.id, row.id));
      processed += 1;
    } catch (error) {
      await db
        .update(webhookEventsInbox)
        .set({
          attemptCount: row.attemptCount + 1,
          lastError: (error as Error).message,
          updatedAt: new Date()
        })
        .where(eq(webhookEventsInbox.id, row.id));
      failed += 1;
    }
  }

  return { processed, failed, total: pending.length };
}
