CREATE TABLE convention_assemblies(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES networks,
  title text NOT NULL,
  scheduled_on date NOT NULL,
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','confirmed','completed','cancelled')),
  quorum_required int NOT NULL DEFAULT 0 CHECK(quorum_required>=0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(network_id,id)
);
CREATE TABLE assembly_delegates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL,
  church_id uuid NOT NULL,
  person_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','confirmed','revoked')),
  checked_in_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(assembly_id) REFERENCES convention_assemblies(id) ON DELETE CASCADE,
  FOREIGN KEY(church_id,person_id) REFERENCES people(church_id,id),
  UNIQUE(assembly_id,church_id,person_id)
);
CREATE TABLE assembly_documents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  kind text NOT NULL DEFAULT 'official' CHECK(kind IN ('notice','agenda','minutes','official','other')),
  added_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(assembly_id) REFERENCES convention_assemblies(id) ON DELETE CASCADE
);
ALTER TABLE convention_assemblies ENABLE ROW LEVEL SECURITY;
ALTER TABLE convention_assemblies FORCE ROW LEVEL SECURITY;
CREATE FUNCTION is_network_member(target_network uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM network_members WHERE network_id=target_network AND user_id=actor_id()) $$;
REVOKE ALL ON FUNCTION is_network_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_network_member(uuid) TO ecclesia_app;
CREATE POLICY assembly_read ON convention_assemblies FOR SELECT USING(
  is_network_member(convention_assemblies.network_id)
  OR EXISTS(SELECT 1 FROM churches c WHERE c.id=tenant_id() AND c.network_id=convention_assemblies.network_id AND local_role() IS NOT NULL)
);
CREATE POLICY assembly_write ON convention_assemblies FOR ALL USING(is_network_member(convention_assemblies.network_id)) WITH CHECK(is_network_member(convention_assemblies.network_id));
ALTER TABLE assembly_delegates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_delegates FORCE ROW LEVEL SECURITY;
CREATE POLICY delegate_read ON assembly_delegates FOR SELECT USING(
  EXISTS(SELECT 1 FROM convention_assemblies a WHERE a.id=assembly_id AND (is_network_member(a.network_id) OR church_id=tenant_id()))
);
CREATE POLICY delegate_write ON assembly_delegates FOR ALL USING(
  church_id=tenant_id() OR EXISTS(SELECT 1 FROM convention_assemblies a WHERE a.id=assembly_id AND is_network_member(a.network_id))
) WITH CHECK(
  (church_id=tenant_id() AND EXISTS(SELECT 1 FROM convention_assemblies a JOIN churches c ON c.network_id=a.network_id WHERE a.id=assembly_id AND c.id=tenant_id()))
  OR EXISTS(SELECT 1 FROM convention_assemblies a WHERE a.id=assembly_id AND is_network_member(a.network_id))
);
ALTER TABLE assembly_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY assembly_document_read ON assembly_documents FOR SELECT USING(EXISTS(SELECT 1 FROM convention_assemblies a WHERE a.id=assembly_id AND (is_network_member(a.network_id) OR EXISTS(SELECT 1 FROM churches c WHERE c.id=tenant_id() AND c.network_id=a.network_id AND local_role() IS NOT NULL))));
CREATE POLICY assembly_document_write ON assembly_documents FOR ALL USING(EXISTS(SELECT 1 FROM convention_assemblies a WHERE a.id=assembly_id AND is_network_member(a.network_id))) WITH CHECK(EXISTS(SELECT 1 FROM convention_assemblies a WHERE a.id=assembly_id AND is_network_member(a.network_id)));
GRANT SELECT,INSERT,UPDATE,DELETE ON convention_assemblies,assembly_delegates,assembly_documents TO ecclesia_app;
GRANT ALL ON convention_assemblies,assembly_delegates,assembly_documents TO ecclesia_service;
CREATE INDEX assemblies_network_date ON convention_assemblies(network_id,scheduled_on,status);
CREATE INDEX assembly_delegates_church ON assembly_delegates(church_id,assembly_id,status);
