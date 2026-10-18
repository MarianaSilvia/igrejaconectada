ALTER TABLE kids_checkins ADD CONSTRAINT kids_checkins_church_id_unique UNIQUE(church_id,id);
ALTER TABLE kids_checkins ADD COLUMN pickup_token_encrypted text NOT NULL DEFAULT '';
CREATE TABLE kids_printer_profiles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name text NOT NULL,
  brand text NOT NULL CHECK(brand IN ('zebra','brother')),
  model text NOT NULL DEFAULT '',
  connection text NOT NULL DEFAULT 'local' CHECK(connection IN ('local','network','worker')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,id)
);
CREATE TABLE kids_print_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  checkin_id uuid NOT NULL,
  printer_id uuid NOT NULL,
  format text NOT NULL CHECK(format IN ('zpl','brother_raster')),
  payload_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','printing','printed','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  printed_at timestamptz,
  FOREIGN KEY(church_id,checkin_id) REFERENCES kids_checkins(church_id,id),
  FOREIGN KEY(church_id,printer_id) REFERENCES kids_printer_profiles(church_id,id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(church_id,id)
);
ALTER TABLE kids_printer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_printer_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY kids_printer_read ON kids_printer_profiles FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_printer_write ON kids_printer_profiles FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
ALTER TABLE kids_print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kids_print_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY kids_print_job_read ON kids_print_jobs FOR SELECT USING(church_id=tenant_id() AND local_role() IS NOT NULL);
CREATE POLICY kids_print_job_write ON kids_print_jobs FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE ON kids_printer_profiles,kids_print_jobs TO ecclesia_app;
GRANT ALL ON kids_printer_profiles,kids_print_jobs TO ecclesia_service;
CREATE INDEX kids_print_jobs_queue ON kids_print_jobs(church_id,status,created_at);
