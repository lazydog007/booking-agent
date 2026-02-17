import crypto from "node:crypto";

type MetaMessage = {
  from: string;
  id: string;
  text?: { body?: string };
  timestamp: string;
};

type MetaStatus = {
  id: string;
  status: string;
  timestamp?: string;
  recipient_id?: string;
};

type MetaChange = {
  value?: {
    metadata?: {
      display_phone_number?: string;
      phone_number_id?: string;
    };
    messages?: MetaMessage[];
    statuses?: MetaStatus[];
  };
};

export type NormalizedInboundMessage = {
  eventType: "message";
  externalMessageId: string;
  fromPhone: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  text: string;
  receivedAt: string;
  raw: unknown;
};

export type NormalizedStatusEvent = {
  eventType: "status";
  externalMessageId: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  status: string;
  recipientPhone: string | null;
  timestamp: string;
  raw: unknown;
};

export type NormalizedWebhookEvent = NormalizedInboundMessage | NormalizedStatusEvent;

export function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature) return false;
  const digest = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return signature === `sha256=${digest}`;
}

export function verifyMetaSignatureAny(rawBody: string, signature: string | null, appSecrets: string[]): boolean {
  for (const secret of appSecrets) {
    if (secret && verifyMetaSignature(rawBody, signature, secret)) return true;
  }
  return false;
}

export function normalizeInboundPayload(payload: any): NormalizedWebhookEvent[] {
  const events: NormalizedWebhookEvent[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of (entry.changes ?? []) as MetaChange[]) {
      const phoneNumberId = change.value?.metadata?.phone_number_id ?? null;
      const displayPhoneNumber = change.value?.metadata?.display_phone_number ?? null;

      for (const msg of (change.value?.messages ?? []) as MetaMessage[]) {
        events.push({
          eventType: "message",
          externalMessageId: msg.id,
          fromPhone: msg.from,
          phoneNumberId,
          displayPhoneNumber,
          text: msg.text?.body ?? "",
          receivedAt: new Date(Number(msg.timestamp) * 1000).toISOString(),
          raw: msg
        });
      }

      for (const status of (change.value?.statuses ?? []) as MetaStatus[]) {
        const timestamp = status.timestamp
          ? new Date(Number(status.timestamp) * 1000).toISOString()
          : new Date().toISOString();
        events.push({
          eventType: "status",
          externalMessageId: status.id,
          phoneNumberId,
          displayPhoneNumber,
          status: status.status,
          recipientPhone: status.recipient_id ?? null,
          timestamp,
          raw: status
        });
      }
    }
  }

  return events;
}

export function deriveWebhookEventKey(event: NormalizedWebhookEvent): string {
  if (event.eventType === "message") {
    return `message:${event.externalMessageId}`;
  }
  return `status:${event.externalMessageId}:${event.status}:${event.timestamp}`;
}

export function extractPhoneNumberIdsFromWebhook(payload: any): string[] {
  const ids = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of (entry.changes ?? []) as MetaChange[]) {
      const id = change.value?.metadata?.phone_number_id;
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

export async function sendWhatsAppMessage(input: {
  phoneNumberId: string;
  to: string;
  text: string;
  accessToken: string;
}) {
  const url = `https://graph.facebook.com/v22.0/${input.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { body: input.text }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Meta send failed: ${response.status} ${errText}`);
  }

  return response.json();
}
