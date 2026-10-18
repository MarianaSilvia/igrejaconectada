CREATE TABLE church_assets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  asset_tag text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','in_use','maintenance','disposed')),
  responsible_person_id uuid,
  acquired_on date,
  value_cents bigint CHECK(value_cents IS NULL OR value_cents>=0),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id,id),
  UNIQUE(church_id,asset_tag),
  FOREIGN KEY(church_id,responsible_person_id) REFERENCES people(church_id,id)
);
CREATE TABLE asset_maintenance(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  asset_id uuid NOT NULL REFERENCES church_assets(id) ON DELETE CASCADE,
  description text NOT NULL,
  scheduled_on date,
  completed_on date,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
  cost_cents bigint NOT NULL DEFAULT 0 CHECK(cost_cents>=0),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,asset_id) REFERENCES church_assets(church_id,id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['church_assets','asset_maintenance'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t); EXECUTE format('CREATE POLICY asset_read ON %I FOR SELECT USING(church_id=tenant_id() AND local_role() IN (''admin'',''secretary''))',t); EXECUTE format('CREATE POLICY asset_write ON %I FOR ALL USING(church_id=tenant_id() AND local_role() IN (''admin'',''secretary'')) WITH CHECK(church_id=tenant_id() AND local_role() IN (''admin'',''secretary''))',t); EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO ecclesia_app',t); EXECUTE format('GRANT ALL ON %I TO ecclesia_service',t); END LOOP; END $$;
CREATE INDEX church_assets_status ON church_assets(church_id,status,location);
CREATE INDEX asset_maintenance_queue ON asset_maintenance(church_id,status,scheduled_on);
