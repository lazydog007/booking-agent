CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
  ADD COLUMN occupied_range tstzrange GENERATED ALWAYS AS (
    tstzrange(
      start_at - (buffer_before_min || ' minutes')::interval,
      end_at + (buffer_after_min || ' minutes')::interval,
      '[)'
    )
  ) STORED;

ALTER TABLE busy_blocks
  ADD COLUMN occupied_range tstzrange GENERATED ALWAYS AS (
    tstzrange(start_at, end_at, '[)')
  ) STORED;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    occupied_range WITH &&
  )
  WHERE (status IN ('hold', 'booked'));

ALTER TABLE busy_blocks
  ADD CONSTRAINT busy_blocks_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    resource_id WITH =,
    occupied_range WITH &&
  );

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolation ON tenants
USING (id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenants_isolation_insert ON tenants FOR INSERT
WITH CHECK (id = current_setting('app.tenant_id', true)::uuid);

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t,
      t
    );
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation_insert ON %I FOR INSERT WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t,
      t
    );
  END LOOP;
END;
$$;
