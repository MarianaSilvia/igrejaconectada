ALTER TABLE education_classes ADD COLUMN public_catalog boolean NOT NULL DEFAULT false;
CREATE INDEX education_classes_public_catalog ON education_classes(church_id,status,public_catalog,starts_on);
