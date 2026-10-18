DROP POLICY workflow_definition_read ON workflow_definitions;
CREATE POLICY workflow_definition_read ON workflow_definitions FOR SELECT USING(
  church_id=tenant_id() AND (
    can_access('people') OR EXISTS(
      SELECT 1 FROM workflow_instances wi
      JOIN people p ON p.id=wi.person_id AND p.church_id=wi.church_id
      WHERE wi.definition_id=workflow_definitions.id AND p.user_id=actor_id()
    )
  )
);
DROP POLICY workflow_step_read ON workflow_steps;
CREATE POLICY workflow_step_read ON workflow_steps FOR SELECT USING(
  church_id=tenant_id() AND (
    can_access('people') OR EXISTS(
      SELECT 1 FROM workflow_instances wi
      JOIN people p ON p.id=wi.person_id AND p.church_id=wi.church_id
      WHERE wi.definition_id=workflow_steps.definition_id AND p.user_id=actor_id()
    )
  )
);
