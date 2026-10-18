CREATE TABLE communication_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches,
  name text NOT NULL,
  channel text NOT NULL CHECK(channel IN ('portal','email','sms')),
  subject text NOT NULL,
  body text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id,name)
);
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY communication_template_read ON communication_templates FOR SELECT USING(church_id=tenant_id() AND can_access('people'));
CREATE POLICY communication_template_write ON communication_templates FOR ALL USING(church_id=tenant_id() AND can_access('people',true)) WITH CHECK(church_id=tenant_id() AND can_access('people',true));
GRANT SELECT,INSERT,UPDATE,DELETE ON communication_templates TO ecclesia_app;
GRANT ALL ON communication_templates TO ecclesia_service;
CREATE INDEX communication_templates_church ON communication_templates(church_id,updated_at DESC);
