-- Administração e secretaria precisam consultar a escala da igreja para montar a ordem do culto.
CREATE POLICY worship_schedule_read ON schedules
  FOR SELECT
  USING (church_id=tenant_id() AND local_role() IN ('admin','secretary'));
