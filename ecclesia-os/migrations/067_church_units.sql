ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'sede',
  ADD COLUMN IF NOT EXISTS parent_church_id uuid,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='churches_unit_type_check') THEN
    ALTER TABLE churches ADD CONSTRAINT churches_unit_type_check CHECK (unit_type IN ('sede','congregacao','campus'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='churches_parent_fk') THEN
    ALTER TABLE churches ADD CONSTRAINT churches_parent_fk FOREIGN KEY (parent_church_id) REFERENCES churches(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='churches_parent_not_self') THEN
    ALTER TABLE churches ADD CONSTRAINT churches_parent_not_self CHECK (parent_church_id IS NULL OR parent_church_id<>id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS churches_parent ON churches(parent_church_id);
CREATE INDEX IF NOT EXISTS churches_network_unit ON churches(network_id,unit_type);
