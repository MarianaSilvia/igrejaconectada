CREATE TABLE document_shares(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  document_id uuid NOT NULL REFERENCES documents,
  person_id uuid NOT NULL,
  granted_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(church_id,document_id,person_id),
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id)
);
ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY document_share_read ON document_shares FOR SELECT USING(church_id=tenant_id() AND (can_access('people') OR EXISTS(SELECT 1 FROM people p WHERE p.id=person_id AND p.user_id=actor_id())));
CREATE POLICY document_share_write ON document_shares FOR INSERT WITH CHECK(church_id=tenant_id() AND can_access('people',true) AND granted_by=actor_id());
CREATE POLICY document_share_revoke ON document_shares FOR UPDATE USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE ON document_shares TO ecclesia_app;
GRANT ALL ON document_shares TO ecclesia_service;
CREATE INDEX document_shares_person ON document_shares(church_id,person_id,revoked_at);
