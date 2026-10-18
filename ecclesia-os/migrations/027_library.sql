CREATE TABLE library_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  item_code text NOT NULL,
  title text NOT NULL,
  author text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  total_copies int NOT NULL DEFAULT 1 CHECK(total_copies>0),
  available_copies int NOT NULL DEFAULT 1 CHECK(available_copies>=0 AND available_copies<=total_copies),
  location text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id,id), UNIQUE(church_id,item_code)
);
CREATE TABLE library_loans(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  item_id uuid NOT NULL,
  person_id uuid NOT NULL,
  loaned_on date NOT NULL DEFAULT CURRENT_DATE,
  due_on date NOT NULL,
  returned_on date,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','returned','overdue','cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id,id),
  FOREIGN KEY(church_id,item_id) REFERENCES library_items(church_id,id),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['library_items','library_loans'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t); EXECUTE format('CREATE POLICY library_read ON %I FOR SELECT USING(church_id=tenant_id() AND local_role() IN (''admin'',''secretary''))',t); EXECUTE format('CREATE POLICY library_write ON %I FOR ALL USING(church_id=tenant_id() AND local_role() IN (''admin'',''secretary'')) WITH CHECK(church_id=tenant_id() AND local_role() IN (''admin'',''secretary''))',t); EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO ecclesia_app',t); EXECUTE format('GRANT ALL ON %I TO ecclesia_service',t); END LOOP; END $$;
CREATE INDEX library_loans_queue ON library_loans(church_id,status,due_on);
