-- Link EcclesiaOS users to their verified Firebase identity.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS firebase_uid text;

CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique
  ON public.users(firebase_uid)
  WHERE firebase_uid IS NOT NULL;

COMMENT ON COLUMN public.users.firebase_uid IS
  'Verified Firebase Authentication uid; identity only, never a role or tenant grant.';
