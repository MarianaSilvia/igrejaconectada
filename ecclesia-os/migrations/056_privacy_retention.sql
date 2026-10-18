CREATE TABLE IF NOT EXISTS privacy_retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  category text NOT NULL,
  retention_days integer CHECK (retention_days IS NULL OR retention_days >= 0),
  legal_basis text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  responsible text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id, category)
);
ALTER TABLE privacy_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_retention_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_retention_isolation ON privacy_retention_policies;
CREATE POLICY privacy_retention_isolation ON privacy_retention_policies
  USING (church_id = tenant_id() AND can_access('people', true))
  WITH CHECK (church_id = tenant_id() AND can_access('people', true));
GRANT SELECT, INSERT, UPDATE ON privacy_retention_policies TO ecclesia_app;
GRANT ALL ON privacy_retention_policies TO ecclesia_service;
