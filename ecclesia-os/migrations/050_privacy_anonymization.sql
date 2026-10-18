ALTER TABLE people ADD COLUMN anonymized_at timestamptz;
CREATE INDEX people_anonymized ON people(church_id,anonymized_at) WHERE anonymized_at IS NOT NULL;
