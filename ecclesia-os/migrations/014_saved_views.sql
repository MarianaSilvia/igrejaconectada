CREATE TABLE saved_views(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL REFERENCES churches,
 kind text NOT NULL CHECK(kind IN ('people','events','tasks')),
 name text NOT NULL, filters jsonb NOT NULL DEFAULT '{}'::jsonb,
 shared boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(church_id,id)
);
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_views_read ON saved_views FOR SELECT USING(church_id=tenant_id() AND (created_by=actor_id() OR shared) AND can_access(CASE WHEN kind='tasks' THEN 'cells' ELSE 'people' END));
CREATE POLICY saved_views_insert ON saved_views FOR INSERT WITH CHECK(church_id=tenant_id() AND created_by=actor_id() AND can_access(CASE WHEN kind='tasks' THEN 'cells' ELSE 'people' END,true));
CREATE POLICY saved_views_update ON saved_views FOR UPDATE USING(church_id=tenant_id() AND created_by=actor_id() AND can_access(CASE WHEN kind='tasks' THEN 'cells' ELSE 'people' END,true)) WITH CHECK(church_id=tenant_id() AND created_by=actor_id());
CREATE POLICY saved_views_delete ON saved_views FOR DELETE USING(church_id=tenant_id() AND created_by=actor_id() AND can_access(CASE WHEN kind='tasks' THEN 'cells' ELSE 'people' END,true));
GRANT SELECT,INSERT,UPDATE,DELETE ON saved_views TO ecclesia_app;
GRANT ALL ON saved_views TO ecclesia_service;
CREATE INDEX saved_views_scope ON saved_views(church_id,kind,created_at DESC);
