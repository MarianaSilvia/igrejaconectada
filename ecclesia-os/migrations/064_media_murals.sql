CREATE TABLE IF NOT EXISTS murals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id),
  title text NOT NULL, body text NOT NULL DEFAULT '', image_url text, image_alt text NOT NULL DEFAULT '',
  cta_label text, cta_url text, audience text NOT NULL DEFAULT 'church', status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz, ends_at timestamptz, priority int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('draft','review','published','archived')),
  CHECK (audience IN ('network','church','campus','group','member')),
  CHECK (image_url IS NULL OR image_url ~ '^https://')
);
CREATE TABLE IF NOT EXISTS media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches(id),
  title text NOT NULL, description text NOT NULL DEFAULT '', kind text NOT NULL,
  source_url text, storage_key text, thumbnail_url text, alt_text text NOT NULL DEFAULT '',
  captions_url text, tags text[] NOT NULL DEFAULT '{}', visibility text NOT NULL DEFAULT 'private',
  event_id uuid, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('youtube','vimeo','audio','photo','gallery','document','livestream')),
  CHECK (visibility IN ('private','church','public')),
  CHECK (source_url IS NULL OR source_url ~ '^https://')
);
CREATE TABLE IF NOT EXISTS media_links (media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE, church_id uuid NOT NULL REFERENCES churches(id), entity_type text NOT NULL, entity_id uuid NOT NULL, PRIMARY KEY(media_id,entity_type,entity_id));
CREATE TABLE IF NOT EXISTS media_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE, church_id uuid NOT NULL REFERENCES churches(id), actor_id uuid REFERENCES users(id), viewed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS media_files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), media_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE, church_id uuid NOT NULL REFERENCES churches(id), name text NOT NULL, media_type text NOT NULL, bytes int NOT NULL, encrypted_content text NOT NULL, created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS thumbnail_type text;
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS encrypted_thumbnail text;
ALTER TABLE murals ENABLE ROW LEVEL SECURITY; ALTER TABLE media_items ENABLE ROW LEVEL SECURITY; ALTER TABLE media_links ENABLE ROW LEVEL SECURITY; ALTER TABLE media_views ENABLE ROW LEVEL SECURITY; ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY murals_tenant ON murals USING (church_id=tenant_id()) WITH CHECK (church_id=tenant_id());
CREATE POLICY media_tenant ON media_items USING (church_id=tenant_id()) WITH CHECK (church_id=tenant_id());
CREATE POLICY media_links_tenant ON media_links USING (church_id=tenant_id()) WITH CHECK (church_id=tenant_id());
CREATE POLICY media_views_tenant ON media_views USING (church_id=tenant_id()) WITH CHECK (church_id=tenant_id());
CREATE POLICY media_files_tenant ON media_files USING (church_id=tenant_id()) WITH CHECK (church_id=tenant_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON murals,media_items,media_links,media_views,media_files TO ecclesia_app;
GRANT ALL ON murals,media_items,media_links,media_views,media_files TO ecclesia_service;
