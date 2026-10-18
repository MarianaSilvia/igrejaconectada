ALTER TABLE education_enrollments DROP CONSTRAINT IF EXISTS education_enrollments_status_check;
ALTER TABLE education_enrollments ADD CONSTRAINT education_enrollments_status_check CHECK(status IN ('active','waitlisted','completed','cancelled'));
CREATE INDEX IF NOT EXISTS education_enrollments_waitlist ON education_enrollments(class_id,status,enrolled_at,id);
