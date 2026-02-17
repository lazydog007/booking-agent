DO $$ BEGIN
  CREATE TYPE whatsapp_integration_mode AS ENUM ('shared_managed', 'bring_your_own');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE whatsapp_integration_status AS ENUM ('active', 'inactive', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE webhook_provider AS ENUM ('meta_whatsapp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE webhook_event_type AS ENUM ('message', 'status', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS whatsapp_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mode whatsapp_integration_mode NOT NULL,
  meta_app_id varchar(255),
  meta_app_secret_encrypted text,
  system_user_token_encrypted text,
  token_expires_at timestamptz,
  status whatsapp_integration_status NOT NULL DEFAULT 'active',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_integrations_tenant_status_idx
  ON whatsapp_integrations (tenant_id, status);

CREATE TABLE IF NOT EXISTS whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES whatsapp_integrations(id) ON DELETE CASCADE,
  phone_number_id varchar(255) NOT NULL,
  display_phone_number varchar(80),
  waba_id varchar(255),
  quality_rating varchar(40),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_channels_tenant_display_phone_uidx UNIQUE (tenant_id, display_phone_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_phone_number_uidx
  ON whatsapp_channels (phone_number_id);

CREATE INDEX IF NOT EXISTS whatsapp_channels_tenant_active_idx
  ON whatsapp_channels (tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_tenant_default_uidx
  ON whatsapp_channels (tenant_id)
  WHERE is_default = true;

ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS whatsapp_channel_id uuid REFERENCES whatsapp_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS message_threads_tenant_whatsapp_channel_idx
  ON message_threads (tenant_id, whatsapp_channel_id);

DO $$ BEGIN
  ALTER TABLE message_threads
    ADD CONSTRAINT message_threads_whatsapp_channel_required_check
    CHECK (channel <> 'whatsapp' OR whatsapp_channel_id IS NOT NULL)
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS webhook_events_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider webhook_provider NOT NULL DEFAULT 'meta_whatsapp',
  event_type webhook_event_type NOT NULL,
  provider_event_key varchar(255) NOT NULL,
  phone_number_id varchar(255),
  payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_inbox_provider_event_uidx
  ON webhook_events_inbox (provider, provider_event_key);

CREATE INDEX IF NOT EXISTS webhook_events_inbox_processed_idx
  ON webhook_events_inbox (processed_at);

CREATE INDEX IF NOT EXISTS webhook_events_inbox_received_idx
  ON webhook_events_inbox (received_at);

ALTER TABLE whatsapp_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_channels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY whatsapp_integrations_tenant_isolation ON whatsapp_integrations
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY whatsapp_integrations_tenant_isolation_insert ON whatsapp_integrations FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY whatsapp_channels_tenant_isolation ON whatsapp_channels
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY whatsapp_channels_tenant_isolation_insert ON whatsapp_channels FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
