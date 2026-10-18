ALTER TABLE operational_tasks ADD COLUMN completed_at timestamptz;
CREATE INDEX operational_tasks_completed_at ON operational_tasks(church_id,source_type,completed_at);
