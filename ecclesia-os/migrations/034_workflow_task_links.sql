ALTER TABLE operational_tasks ADD COLUMN workflow_instance_id uuid;
ALTER TABLE workflow_instances
  ADD CONSTRAINT workflow_instances_church_id_unique UNIQUE (church_id,id);
ALTER TABLE operational_tasks
  ADD CONSTRAINT task_workflow_reference
  FOREIGN KEY (church_id,workflow_instance_id)
  REFERENCES workflow_instances(church_id,id);
CREATE UNIQUE INDEX operational_tasks_workflow_unique
  ON operational_tasks(workflow_instance_id)
  WHERE workflow_instance_id IS NOT NULL
    AND status IN ('open','in_progress');
