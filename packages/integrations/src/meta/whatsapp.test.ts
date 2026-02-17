import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  deriveWebhookEventKey,
  extractPhoneNumberIdsFromWebhook,
  normalizeInboundPayload,
  verifyMetaSignature,
  verifyMetaSignatureAny
} from "./whatsapp";

describe("whatsapp integration", () => {
  it("normalizes message and status events with metadata", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: {
                  phone_number_id: "pnid_1",
                  display_phone_number: "+15550001111"
                },
                messages: [
                  {
                    from: "+15550002222",
                    id: "wamid.message.1",
                    text: { body: "hello" },
                    timestamp: "1739833200"
                  }
                ],
                statuses: [
                  {
                    id: "wamid.outbound.1",
                    status: "delivered",
                    timestamp: "1739833201",
                    recipient_id: "+15550002222"
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const events = normalizeInboundPayload(payload);
    expect(events).toHaveLength(2);

    expect(events[0]).toMatchObject({
      eventType: "message",
      externalMessageId: "wamid.message.1",
      phoneNumberId: "pnid_1",
      displayPhoneNumber: "+15550001111"
    });

    expect(events[1]).toMatchObject({
      eventType: "status",
      externalMessageId: "wamid.outbound.1",
      status: "delivered",
      phoneNumberId: "pnid_1"
    });

    expect(deriveWebhookEventKey(events[0]!)).toBe("message:wamid.message.1");
    expect(deriveWebhookEventKey(events[1]!)).toContain("status:wamid.outbound.1:delivered:");
  });

  it("extracts distinct phone number ids", () => {
    const payload = {
      entry: [
        {
          changes: [
            { value: { metadata: { phone_number_id: "a" } } },
            { value: { metadata: { phone_number_id: "a" } } },
            { value: { metadata: { phone_number_id: "b" } } }
          ]
        }
      ]
    };

    expect(extractPhoneNumberIdsFromWebhook(payload).sort()).toEqual(["a", "b"]);
  });

  it("verifies signature against one of many candidate secrets", () => {
    const body = '{"ok":true}';
    const secret = "secret-1";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

    expect(verifyMetaSignature(body, signature, secret)).toBe(true);
    expect(verifyMetaSignatureAny(body, signature, ["wrong", secret])).toBe(true);
    expect(verifyMetaSignatureAny(body, signature, ["wrong-1", "wrong-2"])).toBe(false);
  });
});
