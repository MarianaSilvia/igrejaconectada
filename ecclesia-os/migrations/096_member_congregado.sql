DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.people'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%visitor%member%worker%inactive%'
  LOOP
    EXECUTE format('ALTER TABLE public.people DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE public.people
  ADD CONSTRAINT people_status_check
  CHECK (status IN ('visitor','congregado','member','worker','inactive'));
