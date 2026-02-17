import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const userRole = pgEnum("user_role", ["owner", "admin", "staff", "viewer"]);
export const appointmentStatus = pgEnum("appointment_status", [
  "hold",
  "booked",
  "canceled",
  "completed",
  "no_show"
]);
export const threadStatus = pgEnum("thread_status", ["open", "handoff", "closed"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
export const actorType = pgEnum("actor_type", ["system", "user", "agent"]);
export const whatsappIntegrationMode = pgEnum("whatsapp_integration_mode", ["shared_managed", "bring_your_own"]);
export const whatsappIntegrationStatus = pgEnum("whatsapp_integration_status", ["active", "inactive", "error"]);
export const webhookProvider = pgEnum("webhook_provider", ["meta_whatsapp"]);
export const webhookEventType = pgEnum("webhook_event_type", ["message", "status", "other"]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull(),
    slotGranularityMinutes: integer("slot_granularity_minutes").default(15).notNull(),
    settings: jsonb("settings_jsonb").default(sql`'{}'::jsonb`).notNull(),
    ...timestamps
  },
  (table) => [uniqueIndex("tenants_slug_uidx").on(table.slug)]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    role: userRole("role").notNull(),
    authProviderId: varchar("auth_provider_id", { length: 255 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps
  },
  (table) => [unique("users_tenant_email_uidx").on(table.tenantId, table.email)]
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sessionTokenHash: varchar("session_token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("user_sessions_token_hash_uidx").on(table.sessionTokenHash),
    index("user_sessions_tenant_user_idx").on(table.tenantId, table.userId),
    index("user_sessions_expires_idx").on(table.expiresAt)
  ]
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps
  },
  (table) => [index("resources_tenant_idx").on(table.tenantId)]
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    phoneE164: varchar("phone_e164", { length: 30 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    email: varchar("email", { length: 255 }),
    timezone: varchar("timezone", { length: 64 }),
    metadata: jsonb("metadata_jsonb").default(sql`'{}'::jsonb`).notNull(),
    ...timestamps
  },
  (table) => [
    unique("clients_tenant_phone_uidx").on(table.tenantId, table.phoneE164),
    index("clients_tenant_name_idx").on(table.tenantId, table.name)
  ]
);

export const appointmentTypes = pgTable(
  "appointment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferBeforeMinutes: integer("buffer_before_min").default(0).notNull(),
    bufferAfterMinutes: integer("buffer_after_min").default(0).notNull(),
    priceCents: integer("price_cents"),
    prepInstructions: text("prep_instructions"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps
  },
  (table) => [unique("appointment_types_tenant_name_uidx").on(table.tenantId, table.name)]
);

export const resourceAppointmentTypes = pgTable(
  "resource_appointment_types",
  {
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    appointmentTypeId: uuid("appointment_type_id")
      .references(() => appointmentTypes.id, { onDelete: "cascade" })
      .notNull(),
    ...timestamps
  },
  (table) => [
    primaryKey({
      name: "resource_appointment_types_pk",
      columns: [table.tenantId, table.resourceId, table.appointmentTypeId]
    })
  ]
);

export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    weekday: integer("weekday").notNull(),
    startLocalTime: time("start_local_time").notNull(),
    endLocalTime: time("end_local_time").notNull(),
    isWorking: boolean("is_working").default(true).notNull(),
    ...timestamps
  },
  (table) => [
    check("schedules_weekday_check", sql`${table.weekday} >= 0 AND ${table.weekday} <= 6`),
    index("schedules_tenant_resource_weekday_idx").on(table.tenantId, table.resourceId, table.weekday)
  ]
);

export const scheduleExceptions = pgTable(
  "schedule_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    dateLocal: date("date_local").notNull(),
    isClosed: boolean("is_closed").default(false).notNull(),
    startLocalTime: time("start_local_time"),
    endLocalTime: time("end_local_time"),
    label: varchar("label", { length: 120 }),
    ...timestamps
  },
  (table) => [index("schedule_exceptions_tenant_resource_date_idx").on(table.tenantId, table.resourceId, table.dateLocal)]
);

export const busyBlocks = pgTable(
  "busy_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 255 }),
    source: varchar("source", { length: 60 }).default("manual").notNull(),
    ...timestamps
  },
  (table) => [
    check("busy_blocks_range_check", sql`${table.endAt} > ${table.startAt}`),
    index("busy_blocks_tenant_resource_start_idx").on(table.tenantId, table.resourceId, table.startAt)
  ]
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "restrict" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "restrict" })
      .notNull(),
    appointmentTypeId: uuid("appointment_type_id")
      .references(() => appointmentTypes.id, { onDelete: "restrict" })
      .notNull(),
    status: appointmentStatus("status").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    bufferBeforeMin: integer("buffer_before_min").default(0).notNull(),
    bufferAfterMin: integer("buffer_after_min").default(0).notNull(),
    reasonForVisit: varchar("reason_for_visit", { length: 200 }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    cancelReason: varchar("cancel_reason", { length: 255 }),
    rescheduledFromAppointmentId: uuid("rescheduled_from_appointment_id").references((): any => appointments.id),
    ...timestamps
  },
  (table) => [
    check("appointments_range_check", sql`${table.endAt} > ${table.startAt}`),
    index("appointments_tenant_resource_start_idx").on(table.tenantId, table.resourceId, table.startAt),
    index("appointments_tenant_client_start_idx").on(table.tenantId, table.clientId, table.startAt)
  ]
);

export const appointmentNotes = pgTable(
  "appointment_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    appointmentId: uuid("appointment_id")
      .references(() => appointments.id, { onDelete: "cascade" })
      .notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    noteText: text("note_text").notNull(),
    isInternal: boolean("is_internal").default(true).notNull(),
    ...timestamps
  },
  (table) => [index("appointment_notes_tenant_appointment_idx").on(table.tenantId, table.appointmentId)]
);

export const whatsappIntegrations = pgTable(
  "whatsapp_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    mode: whatsappIntegrationMode("mode").notNull(),
    metaAppId: varchar("meta_app_id", { length: 255 }),
    metaAppSecretEncrypted: text("meta_app_secret_encrypted"),
    systemUserTokenEncrypted: text("system_user_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    status: whatsappIntegrationStatus("status").default("active").notNull(),
    lastError: text("last_error"),
    ...timestamps
  },
  (table) => [index("whatsapp_integrations_tenant_status_idx").on(table.tenantId, table.status)]
);

export const whatsappChannels = pgTable(
  "whatsapp_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    integrationId: uuid("integration_id")
      .references(() => whatsappIntegrations.id, { onDelete: "cascade" })
      .notNull(),
    phoneNumberId: varchar("phone_number_id", { length: 255 }).notNull(),
    displayPhoneNumber: varchar("display_phone_number", { length: 80 }),
    wabaId: varchar("waba_id", { length: 255 }),
    qualityRating: varchar("quality_rating", { length: 40 }),
    isDefault: boolean("is_default").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("whatsapp_channels_phone_number_uidx").on(table.phoneNumberId),
    unique("whatsapp_channels_tenant_display_phone_uidx").on(table.tenantId, table.displayPhoneNumber),
    index("whatsapp_channels_tenant_active_idx").on(table.tenantId, table.isActive),
    uniqueIndex("whatsapp_channels_tenant_default_uidx").on(table.tenantId).where(sql`${table.isDefault} = true`)
  ]
);

export const messageThreads = pgTable(
  "message_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    channel: varchar("channel", { length: 40 }).default("whatsapp").notNull(),
    clientId: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    whatsappChannelId: uuid("whatsapp_channel_id").references(() => whatsappChannels.id, { onDelete: "set null" }),
    externalThreadId: varchar("external_thread_id", { length: 255 }),
    status: threadStatus("status").default("open").notNull(),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
  },
  (table) => [
    unique("message_threads_tenant_channel_client_uidx").on(table.tenantId, table.channel, table.clientId),
    index("message_threads_tenant_whatsapp_channel_idx").on(table.tenantId, table.whatsappChannelId),
    check(
      "message_threads_whatsapp_channel_required_check",
      sql`(${table.channel} <> 'whatsapp') OR (${table.whatsappChannelId} IS NOT NULL)`
    )
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    threadId: uuid("thread_id")
      .references(() => messageThreads.id, { onDelete: "cascade" })
      .notNull(),
    direction: messageDirection("direction").notNull(),
    text: text("text").notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    rawPayload: jsonb("raw_payload_jsonb").default(sql`'{}'::jsonb`).notNull(),
    deliveryStatus: varchar("delivery_status", { length: 50 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("messages_tenant_thread_created_idx").on(table.tenantId, table.threadId, table.createdAt),
    uniqueIndex("messages_provider_message_uidx").on(table.providerMessageId)
  ]
);

export const conversationState = pgTable(
  "conversation_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    threadId: uuid("thread_id")
      .references(() => messageThreads.id, { onDelete: "cascade" })
      .notNull(),
    phoneE164: varchar("phone_e164", { length: 30 }).notNull(),
    state: varchar("state", { length: 60 }).notNull(),
    context: jsonb("context_jsonb").default(sql`'{}'::jsonb`).notNull(),
    lastIntent: varchar("last_intent", { length: 100 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    unique("conversation_state_tenant_phone_uidx").on(table.tenantId, table.phoneE164),
    index("conversation_state_tenant_state_idx").on(table.tenantId, table.state)
  ]
);

export const webhookEventsInbox = pgTable(
  "webhook_events_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: webhookProvider("provider").default("meta_whatsapp").notNull(),
    eventType: webhookEventType("event_type").notNull(),
    providerEventKey: varchar("provider_event_key", { length: 255 }).notNull(),
    phoneNumberId: varchar("phone_number_id", { length: 255 }),
    payloadJson: jsonb("payload_jsonb").default(sql`'{}'::jsonb`).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastError: text("last_error"),
    ...timestamps
  },
  (table) => [
    uniqueIndex("webhook_events_inbox_provider_event_uidx").on(table.provider, table.providerEventKey),
    index("webhook_events_inbox_processed_idx").on(table.processedAt),
    index("webhook_events_inbox_received_idx").on(table.receivedAt)
  ]
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    beforeJson: jsonb("before_jsonb"),
    afterJson: jsonb("after_jsonb"),
    ip: varchar("ip", { length: 80 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("audit_logs_tenant_entity_created_idx").on(table.tenantId, table.entityType, table.entityId, table.createdAt)]
);
