CREATE INDEX registration_queue_page ON registration_submissions(church_id,status,created_at DESC,id DESC);
CREATE INDEX registration_queue_all ON registration_submissions(church_id,created_at DESC,id DESC);

CREATE TABLE action_permissions(
 church_id uuid NOT NULL, user_id uuid NOT NULL, action text NOT NULL
 CHECK(action IN ('people.read','people.write','cells.read','cells.write','finance.read','finance.write','pastoral.read','pastoral.write')),
 allowed boolean NOT NULL, PRIMARY KEY(church_id,user_id,action),
 FOREIGN KEY(user_id,church_id) REFERENCES memberships(user_id,church_id) ON DELETE CASCADE
);
ALTER TABLE action_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_permissions FORCE ROW LEVEL SECURITY;
GRANT ALL ON action_permissions TO ecclesia_service;

CREATE OR REPLACE FUNCTION can_access(scope text, writing boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM action_permissions p WHERE p.church_id=tenant_id() AND p.user_id=actor_id() AND p.action=scope||CASE WHEN writing THEN '.write' ELSE '.read' END AND NOT p.allowed) THEN false ELSE
 COALESCE((SELECT CASE WHEN scope='pastoral' THEN false WHEN role='admin' THEN true WHEN scope='people' THEN role='secretary' WHEN scope='cells' THEN role IN ('leader','secretary') WHEN scope='finance' THEN role='treasurer' ELSE false END FROM memberships WHERE user_id=actor_id() AND church_id=tenant_id()),false)
 OR EXISTS(SELECT 1 FROM action_permissions p JOIN memberships m ON m.user_id=p.user_id AND m.church_id=p.church_id WHERE p.church_id=tenant_id() AND p.user_id=actor_id() AND p.allowed AND p.action=scope||CASE WHEN writing THEN '.write' ELSE '.read' END)
 OR (NOT writing AND scope IN ('people','cells','finance') AND EXISTS(SELECT 1 FROM access_grants g JOIN churches c ON c.id=g.church_id JOIN network_members n ON n.network_id=c.network_id AND n.user_id=g.user_id WHERE g.church_id=tenant_id() AND g.user_id=actor_id() AND g.scope=can_access.scope AND g.revoked_at IS NULL AND g.expires_at>now())) END
$$;
REVOKE ALL ON FUNCTION can_access(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_access(text,boolean) TO ecclesia_app,ecclesia_service;

CREATE TABLE cell_assignments(
 church_id uuid NOT NULL, cell_id uuid NOT NULL, user_id uuid NOT NULL,
 responsibility text NOT NULL CHECK(responsibility IN ('leader','supervisor')),
 PRIMARY KEY(cell_id,user_id),
 FOREIGN KEY(church_id,cell_id) REFERENCES cells(church_id,id),
 FOREIGN KEY(user_id,church_id) REFERENCES memberships(user_id,church_id) ON DELETE CASCADE
);
ALTER TABLE cell_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cell_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY assignments_read ON cell_assignments FOR SELECT USING(church_id=tenant_id() AND (user_id=actor_id() OR local_role() IN ('admin','secretary')));
GRANT SELECT ON cell_assignments TO ecclesia_app;
GRANT ALL ON cell_assignments TO ecclesia_service;
CREATE FUNCTION assigned_cell(cell uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM cell_assignments a WHERE a.church_id=tenant_id() AND a.cell_id=cell AND a.user_id=actor_id())
$$;
REVOKE ALL ON FUNCTION assigned_cell(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assigned_cell(uuid) TO ecclesia_app,ecclesia_service;
CREATE POLICY assigned_cells ON cells AS RESTRICTIVE USING(local_role() IS DISTINCT FROM 'leader' OR assigned_cell(id)) WITH CHECK(local_role() IS DISTINCT FROM 'leader' OR assigned_cell(id));
DROP POLICY leader_people ON people;
CREATE POLICY leader_people ON people FOR SELECT USING(church_id=tenant_id() AND local_role()='leader' AND EXISTS(SELECT 1 FROM cell_members cm WHERE cm.person_id=people.id AND assigned_cell(cm.cell_id)));
-- A leader's explicit person permission must not widen access outside assigned groups.
CREATE FUNCTION assigned_person(person uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM cell_members cm JOIN cell_assignments a ON a.cell_id=cm.cell_id AND a.church_id=cm.church_id WHERE cm.church_id=tenant_id() AND cm.person_id=person AND a.user_id=actor_id())
$$;
REVOKE ALL ON FUNCTION assigned_person(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assigned_person(uuid) TO ecclesia_app,ecclesia_service;
CREATE POLICY assigned_people ON people AS RESTRICTIVE USING(local_role() IS DISTINCT FROM 'leader' OR user_id=actor_id() OR assigned_person(id)) WITH CHECK(local_role() IS DISTINCT FROM 'leader' OR assigned_person(id));

ALTER TABLE pix_charges ADD COLUMN request_key uuid;
ALTER TABLE pix_charges ADD CONSTRAINT pix_request_unique UNIQUE(church_id,user_id,request_key);
ALTER TABLE pix_charges DROP CONSTRAINT pix_charges_status_check;
ALTER TABLE pix_charges ADD CONSTRAINT pix_charges_status_check CHECK(status IN ('creating','active','settled','expired','refunded'));
CREATE TABLE integration_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 kind text NOT NULL CHECK(kind IN ('pix.create','pix.reconcile')), resource_id uuid NOT NULL REFERENCES pix_charges,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed')),
 attempts int NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz, lease_token uuid, last_error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,resource_id)
);
CREATE INDEX integration_jobs_ready ON integration_jobs(available_at) WHERE status IN ('pending','running');
ALTER TABLE integration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY jobs_read ON integration_jobs FOR SELECT USING(church_id=tenant_id() AND can_access('finance') AND finance_scope_allowed());
GRANT SELECT ON integration_jobs TO ecclesia_app;
GRANT ALL ON integration_jobs TO ecclesia_service;
CREATE FUNCTION enqueue_pix_creation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.status='creating' THEN INSERT INTO integration_jobs(church_id,kind,resource_id) VALUES(NEW.church_id,'pix.create',NEW.id); END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION enqueue_pix_creation() FROM PUBLIC;
CREATE TRIGGER pix_creation_job AFTER INSERT ON pix_charges FOR EACH ROW EXECUTE FUNCTION enqueue_pix_creation();

ALTER TABLE privacy_requests ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE privacy_requests ADD COLUMN assigned_to uuid;
ALTER TABLE privacy_requests ADD CONSTRAINT privacy_assignee FOREIGN KEY(assigned_to,church_id) REFERENCES memberships(user_id,church_id);

ALTER TABLE users ADD COLUMN disabled_at timestamptz;
CREATE TABLE account_invites(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 email text NOT NULL, name text NOT NULL, role text NOT NULL CHECK(role IN ('admin','secretary','treasurer','leader','member')),
 token_hash text NOT NULL UNIQUE, encrypted_secret text NOT NULL, expires_at timestamptz NOT NULL,
 created_by uuid NOT NULL REFERENCES users, accepted_at timestamptz, revoked_at timestamptz, attempts int NOT NULL DEFAULT 0
);
ALTER TABLE account_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_invites FORCE ROW LEVEL SECURITY;
GRANT ALL ON account_invites TO ecclesia_service;

CREATE TABLE account_recoveries(
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, expires_at timestamptz NOT NULL,
 used_at timestamptz, encrypted_reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_recoveries FORCE ROW LEVEL SECURITY;
GRANT ALL ON account_recoveries TO ecclesia_service;
CREATE TABLE mfa_changes(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users,encrypted_secret text NOT NULL,expires_at timestamptz NOT NULL,attempts int NOT NULL DEFAULT 0);
CREATE TABLE mfa_backup_codes(user_id uuid NOT NULL REFERENCES users,code_hash text NOT NULL,PRIMARY KEY(user_id,code_hash));
CREATE TABLE security_attempts(key_hash text PRIMARY KEY,attempts int NOT NULL DEFAULT 0,until_at timestamptz NOT NULL);
ALTER TABLE mfa_changes ENABLE ROW LEVEL SECURITY; ALTER TABLE mfa_changes FORCE ROW LEVEL SECURITY;
ALTER TABLE mfa_backup_codes ENABLE ROW LEVEL SECURITY; ALTER TABLE mfa_backup_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE security_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE security_attempts FORCE ROW LEVEL SECURITY;
GRANT ALL ON mfa_changes,mfa_backup_codes,security_attempts TO ecclesia_service;
DROP POLICY prayer_author ON prayer_requests;
CREATE POLICY prayer_read ON prayer_requests FOR SELECT USING(church_id=tenant_id() AND (user_id=actor_id() OR can_access('pastoral')));
CREATE POLICY prayer_insert ON prayer_requests FOR INSERT WITH CHECK(church_id=tenant_id() AND user_id=actor_id() AND local_role() IS NOT NULL);
DROP POLICY note_author ON pastoral_notes;
CREATE POLICY note_author ON pastoral_notes USING(church_id=tenant_id() AND author_id=actor_id() AND can_access('pastoral')) WITH CHECK(church_id=tenant_id() AND author_id=actor_id() AND can_access('pastoral',true));
