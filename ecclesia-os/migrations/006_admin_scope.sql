ALTER TABLE memberships ADD CONSTRAINT administrative_roles_are_church_wide CHECK(role NOT IN ('admin','treasurer') OR campus_id IS NULL);
