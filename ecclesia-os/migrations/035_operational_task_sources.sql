ALTER TABLE operational_tasks ADD COLUMN source_type text;
ALTER TABLE operational_tasks ADD COLUMN source_id uuid;
CREATE UNIQUE INDEX operational_tasks_source_unique
  ON operational_tasks(church_id,source_type,source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
