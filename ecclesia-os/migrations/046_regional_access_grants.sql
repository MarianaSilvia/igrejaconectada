CREATE TABLE regional_access_grants(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions,
  user_id uuid NOT NULL REFERENCES users,
  scope text NOT NULL CHECK(scope IN ('people','cells','finance')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  granted_by uuid NOT NULL REFERENCES users,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(region_id,user_id,scope)
);
ALTER TABLE regional_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE regional_access_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY regional_grant_read ON regional_access_grants FOR SELECT USING(
  user_id=actor_id() OR EXISTS(SELECT 1 FROM regions r WHERE r.id=region_id AND is_network_member(r.network_id))
);
CREATE POLICY regional_grant_write ON regional_access_grants FOR ALL USING(
  EXISTS(SELECT 1 FROM regions r WHERE r.id=region_id AND is_network_member(r.network_id))
) WITH CHECK(
  EXISTS(SELECT 1 FROM regions r WHERE r.id=region_id AND is_network_member(r.network_id))
);
GRANT SELECT,INSERT,UPDATE,DELETE ON regional_access_grants TO ecclesia_app;
GRANT ALL ON regional_access_grants TO ecclesia_service;
CREATE INDEX regional_grants_active ON regional_access_grants(region_id,user_id,scope) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION can_access(scope text, writing boolean DEFAULT false) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM action_permissions p WHERE p.church_id=tenant_id() AND p.user_id=actor_id() AND p.action=scope||CASE WHEN writing THEN '.write' ELSE '.read' END AND NOT p.allowed) THEN false ELSE
 COALESCE((SELECT CASE WHEN scope='pastoral' THEN false WHEN role='admin' THEN true WHEN scope='people' THEN role='secretary' WHEN scope='cells' THEN role IN ('leader','secretary') WHEN scope='finance' THEN role='treasurer' ELSE false END FROM memberships WHERE user_id=actor_id() AND church_id=tenant_id()),false)
 OR EXISTS(SELECT 1 FROM action_permissions p JOIN memberships m ON m.user_id=p.user_id AND m.church_id=p.church_id WHERE p.church_id=tenant_id() AND p.user_id=actor_id() AND p.allowed AND p.action=scope||CASE WHEN writing THEN '.write' ELSE '.read' END)
 OR (NOT writing AND scope IN ('people','cells','finance') AND EXISTS(SELECT 1 FROM access_grants g JOIN churches c ON c.id=g.church_id JOIN network_members n ON n.network_id=c.network_id AND n.user_id=g.user_id WHERE g.church_id=tenant_id() AND g.user_id=actor_id() AND g.scope=can_access.scope AND g.revoked_at IS NULL AND g.expires_at>now()) )
 OR (NOT writing AND scope IN ('people','cells','finance') AND EXISTS(SELECT 1 FROM regional_access_grants g JOIN churches c ON c.region_id=g.region_id WHERE c.id=tenant_id() AND g.user_id=actor_id() AND g.scope=can_access.scope AND g.revoked_at IS NULL AND g.expires_at>now()) ) END
$$;
REVOKE ALL ON FUNCTION can_access(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION can_access(text,boolean) TO ecclesia_app,ecclesia_service;
