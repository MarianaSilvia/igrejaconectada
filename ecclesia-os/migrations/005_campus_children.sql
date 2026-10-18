CREATE POLICY scoped_cell_members ON cell_members AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM cells c WHERE c.id=cell_id)) WITH CHECK(EXISTS(SELECT 1 FROM cells c WHERE c.id=cell_id));
CREATE POLICY scoped_meetings ON meetings AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM cells c WHERE c.id=cell_id)) WITH CHECK(EXISTS(SELECT 1 FROM cells c WHERE c.id=cell_id));
CREATE POLICY scoped_attendance ON attendance AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM meetings m WHERE m.id=meeting_id)) WITH CHECK(EXISTS(SELECT 1 FROM meetings m WHERE m.id=meeting_id));
CREATE POLICY scoped_workflows ON workflow_cards AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM people p WHERE p.id=person_id)) WITH CHECK(EXISTS(SELECT 1 FROM people p WHERE p.id=person_id));
CREATE POLICY scoped_terms ON leadership_terms AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM people p WHERE p.id=person_id)) WITH CHECK(EXISTS(SELECT 1 FROM people p WHERE p.id=person_id));
CREATE POLICY scoped_credentials ON credentials AS RESTRICTIVE USING(EXISTS(SELECT 1 FROM people p WHERE p.id=person_id)) WITH CHECK(EXISTS(SELECT 1 FROM people p WHERE p.id=person_id));
-- Treasury is church-wide in v1; campus-scoped roles cannot access it.
CREATE FUNCTION finance_scope_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=actor_id() AND church_id=tenant_id() AND campus_id IS NOT NULL) $$;
REVOKE ALL ON FUNCTION finance_scope_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance_scope_allowed() TO ecclesia_app;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['accounts','cost_centers','journal_entries','journal_lines','financial_closings'] LOOP EXECUTE format('CREATE POLICY finance_church_only ON %I AS RESTRICTIVE USING(finance_scope_allowed()) WITH CHECK(finance_scope_allowed())',t); END LOOP; END $$;
