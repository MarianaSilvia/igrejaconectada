CREATE TABLE member_access_credentials(
  church_id uuid NOT NULL REFERENCES churches,
  person_id uuid NOT NULL REFERENCES people ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  access_code text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  must_change boolean NOT NULL DEFAULT true,
  issued_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY(church_id,person_id),
  FOREIGN KEY(user_id,church_id) REFERENCES memberships(user_id,church_id) ON DELETE CASCADE
);
ALTER TABLE member_access_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_access_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY member_access_read ON member_access_credentials FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY member_access_write ON member_access_credentials FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE ON member_access_credentials TO ecclesia_app;
GRANT ALL ON member_access_credentials TO ecclesia_service;
CREATE INDEX member_access_credentials_code ON member_access_credentials(access_code) WHERE revoked_at IS NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_access_code text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_pin_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_pin_must_change boolean NOT NULL DEFAULT false;
CREATE INDEX users_member_access_code ON users(member_access_code) WHERE member_access_code IS NOT NULL;