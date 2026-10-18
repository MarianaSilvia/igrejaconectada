-- Offboarding revokes access immediately. Unassigned care returns to its authorized team.
DROP POLICY task_read ON operational_tasks;
CREATE POLICY task_read ON operational_tasks FOR SELECT USING(church_id=tenant_id() AND can_access(scope) AND (scope<>'pastoral' OR created_by=actor_id() OR assigned_to=actor_id() OR assigned_to IS NULL));
