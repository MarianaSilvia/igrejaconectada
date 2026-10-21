-- Normalize legacy module aliases after the unified navigation rollout.
-- Active churches in the pilot receive the standard operational areas.
UPDATE public.churches
SET modules = ARRAY[
  'secretariat',
  'groups',
  'treasury',
  'operations',
  'participation',
  'communication',
  'governance'
]::text[]
WHERE active = true
  AND (
    modules && ARRAY['people','cells','finance']::text[]
    OR unit_type IN ('sede','congregacao','campus')
  );
