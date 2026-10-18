ALTER TABLE education_courses
  ADD COLUMN IF NOT EXISTS track text NOT NULL DEFAULT 'curso',
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS certificate_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_catalog boolean NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='education_courses_track_check') THEN
    ALTER TABLE education_courses ADD CONSTRAINT education_courses_track_check CHECK (track IN ('ebd','discipulado','curso','formacao','treinamento'));
  END IF;
END $$;
ALTER TABLE education_classes
  ADD COLUMN IF NOT EXISTS discipler_id uuid,
  ADD COLUMN IF NOT EXISTS assistant_id uuid,
  ADD COLUMN IF NOT EXISTS meeting_frequency text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'presencial',
  ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'open';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='education_classes_delivery_mode_check') THEN
    ALTER TABLE education_classes ADD CONSTRAINT education_classes_delivery_mode_check CHECK (delivery_mode IN ('presencial','online','hibrido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='education_classes_completion_status_check') THEN
    ALTER TABLE education_classes ADD CONSTRAINT education_classes_completion_status_check CHECK (completion_status IN ('open','in_progress','completed','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='education_classes_discipler_fk') THEN
    ALTER TABLE education_classes ADD CONSTRAINT education_classes_discipler_fk FOREIGN KEY (discipler_id,church_id) REFERENCES memberships(user_id,church_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='education_classes_assistant_fk') THEN
    ALTER TABLE education_classes ADD CONSTRAINT education_classes_assistant_fk FOREIGN KEY (assistant_id,church_id) REFERENCES memberships(user_id,church_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS education_courses_track ON education_courses(church_id,track,active);
CREATE INDEX IF NOT EXISTS education_classes_discipler ON education_classes(church_id,discipler_id);
