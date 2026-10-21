CREATE TABLE IF NOT EXISTS church_pix_settings (
  church_id uuid PRIMARY KEY REFERENCES churches(id) ON DELETE CASCADE,
  pix_key text NOT NULL CHECK (length(trim(pix_key)) BETWEEN 1 AND 200),
  pix_key_type text NOT NULL CHECK (pix_key_type IN ('cpf','cnpj','email','phone','random')),
  institution_name text NOT NULL CHECK (length(trim(institution_name)) BETWEEN 2 AND 160),
  city text NOT NULL CHECK (length(trim(city)) BETWEEN 2 AND 80),
  instructions text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  portal_visible boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE church_pix_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS church_pix_settings_app_scope ON church_pix_settings;
CREATE POLICY church_pix_settings_app_scope ON church_pix_settings
  USING (church_id = tenant_id())
  WITH CHECK (church_id = tenant_id());
DROP POLICY IF EXISTS church_pix_settings_service_context ON church_pix_settings;
CREATE POLICY church_pix_settings_service_context ON church_pix_settings
  TO ecclesia_service USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON church_pix_settings TO ecclesia_app;
GRANT SELECT, INSERT, UPDATE ON church_pix_settings TO ecclesia_service;