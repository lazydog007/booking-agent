import { db, tenants, whatsappChannels, whatsappIntegrations } from "@booking-agent/db";
import { encryptSecret } from "@booking-agent/shared";
import { eq } from "drizzle-orm";

export async function backfillLegacyWhatsAppChannels() {
  const legacyPhoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const legacyAccessToken = process.env.META_ACCESS_TOKEN;
  const legacyAppSecret = process.env.META_APP_SECRET;

  if (!legacyPhoneNumberId || !legacyAccessToken) {
    return { createdIntegrations: 0, createdChannels: 0, skipped: true };
  }

  const allTenants = await db.select({ id: tenants.id }).from(tenants);
  let createdIntegrations = 0;
  let createdChannels = 0;

  for (const tenant of allTenants) {
    const existingIntegration = await db.query.whatsappIntegrations.findFirst({
      where: eq(whatsappIntegrations.tenantId, tenant.id)
    });

    const integrationId = existingIntegration?.id ?? (
      await db
        .insert(whatsappIntegrations)
        .values({
          tenantId: tenant.id,
          mode: "shared_managed",
          metaAppSecretEncrypted: legacyAppSecret ? encryptSecret(legacyAppSecret) : null,
          systemUserTokenEncrypted: encryptSecret(legacyAccessToken),
          status: "active"
        })
        .returning({ id: whatsappIntegrations.id })
        .then((rows) => rows[0]?.id)
    );

    if (!integrationId) continue;
    if (!existingIntegration) createdIntegrations += 1;

    const existingChannel = await db.query.whatsappChannels.findFirst({
      where: eq(whatsappChannels.phoneNumberId, legacyPhoneNumberId)
    });
    if (existingChannel) continue;

    const [channel] = await db
      .insert(whatsappChannels)
      .values({
        tenantId: tenant.id,
        integrationId,
        phoneNumberId: legacyPhoneNumberId,
        isDefault: true,
        isActive: true
      })
      .onConflictDoNothing({ target: [whatsappChannels.phoneNumberId] })
      .returning({ id: whatsappChannels.id });

    if (channel) createdChannels += 1;
  }

  return { createdIntegrations, createdChannels, skipped: false };
}
