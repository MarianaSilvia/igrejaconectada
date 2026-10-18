CREATE TABLE IF NOT EXISTS media_public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  church_id uuid NOT NULL REFERENCES churches(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz,
  revoked_at timestamptz, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE media_public_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_public_links_tenant ON media_public_links USING (church_id=tenant_id()) WITH CHECK (church_id=tenant_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON media_public_links TO ecclesia_app;
GRANT ALL ON media_public_links TO ecclesia_service;
