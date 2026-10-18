-- A posted entry cannot gain new lines in a later transaction.
CREATE FUNCTION protect_posted_lines() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM journal_entries e WHERE e.id=NEW.entry_id AND e.church_id=NEW.church_id AND e.xmin::text=txid_current()::text) THEN RAISE EXCEPTION 'Journal entry is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_journal BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION protect_posted_lines();
CREATE FUNCTION campus_allowed(campus uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND church_id=tenant_id() AND campus_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND church_id=tenant_id() AND campus_id=campus)
$$;
REVOKE ALL ON FUNCTION campus_allowed(uuid),protect_posted_lines() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION campus_allowed(uuid) TO ecclesia_app;
CREATE POLICY campus_people ON people AS RESTRICTIVE USING(campus_allowed(campus_id)) WITH CHECK(campus_allowed(campus_id));
CREATE POLICY campus_cells ON cells AS RESTRICTIVE USING(campus_allowed(campus_id)) WITH CHECK(campus_allowed(campus_id));
CREATE TABLE documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches, name text NOT NULL, media_type text NOT NULL, encrypted_content text NOT NULL, created_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE documents ENABLE ROW LEVEL SECURITY; ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY document_read ON documents FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY document_write ON documents FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true) AND created_by=actor_id());
GRANT SELECT,INSERT ON documents TO ecclesia_app;
GRANT ALL ON documents TO ecclesia_service;
ALTER TABLE users ADD COLUMN last_totp_step bigint;
