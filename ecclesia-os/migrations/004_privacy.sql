ALTER TABLE privacy_requests ADD COLUMN resolution_reason text;
GRANT UPDATE ON privacy_requests TO ecclesia_app;
DROP POLICY privacy_author ON privacy_requests;
CREATE POLICY privacy_read ON privacy_requests FOR SELECT USING(church_id=tenant_id() AND (user_id=actor_id() OR local_role()='admin'));
CREATE POLICY privacy_insert ON privacy_requests FOR INSERT WITH CHECK(church_id=tenant_id() AND user_id=actor_id() AND local_role() IS NOT NULL);
CREATE POLICY privacy_update ON privacy_requests FOR UPDATE USING(church_id=tenant_id() AND local_role()='admin') WITH CHECK(church_id=tenant_id() AND local_role()='admin');
-- A volunteer can read the names of people in cells, but no global member directory.
CREATE POLICY leader_people ON people FOR SELECT USING(church_id=tenant_id() AND local_role()='leader' AND EXISTS(SELECT 1 FROM cell_members cm WHERE cm.person_id=people.id));
