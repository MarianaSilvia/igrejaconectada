CREATE TABLE worship_services(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  event_id uuid,
  title text NOT NULL,
  scheduled_on date NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','completed','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,event_id) REFERENCES church_events(church_id,id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,id)
);
CREATE TABLE worship_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  service_id uuid NOT NULL,
  position int NOT NULL CHECK(position>0),
  kind text NOT NULL CHECK(kind IN ('song','reading','prayer','message','offering','announcement','other')),
  title text NOT NULL,
  leader_id uuid,
  duration_minutes int CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 240),
  notes text NOT NULL DEFAULT '',
  FOREIGN KEY(church_id,service_id) REFERENCES worship_services(church_id,id) ON DELETE CASCADE,
  FOREIGN KEY(leader_id) REFERENCES users(id),
  UNIQUE(service_id,position)
);
CREATE TABLE worship_rehearsals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  service_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  FOREIGN KEY(church_id,service_id) REFERENCES worship_services(church_id,id) ON DELETE CASCADE,
  CHECK(ends_at>starts_at),
  UNIQUE(service_id,starts_at)
);
CREATE TABLE worship_files(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  service_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'material' CHECK(kind IN ('repertoire','slide','lyric','material','other')),
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(church_id,service_id) REFERENCES worship_services(church_id,id) ON DELETE CASCADE,
  FOREIGN KEY(added_by) REFERENCES users(id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['worship_services','worship_items','worship_rehearsals','worship_files'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
END LOOP; END $$;
CREATE POLICY worship_service_read ON worship_services FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY worship_service_write ON worship_services FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY worship_item_read ON worship_items FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY worship_item_write ON worship_items FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY worship_rehearsal_read ON worship_rehearsals FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY worship_rehearsal_write ON worship_rehearsals FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
CREATE POLICY worship_file_read ON worship_files FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY worship_file_write ON worship_files FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON worship_services,worship_items,worship_rehearsals,worship_files TO ecclesia_app;
GRANT ALL ON worship_services,worship_items,worship_rehearsals,worship_files TO ecclesia_service;
CREATE INDEX worship_services_date ON worship_services(church_id,scheduled_on,status);
CREATE INDEX worship_items_service ON worship_items(church_id,service_id,position);
