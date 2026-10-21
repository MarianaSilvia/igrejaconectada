-- Compatibility for fresh and existing databases: network helper functions require a role column.
ALTER TABLE public.network_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'network_admin',
  ADD COLUMN IF NOT EXISTS granted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

UPDATE public.network_members
SET role='network_admin'
WHERE role IS NULL OR role='';

CREATE INDEX IF NOT EXISTS network_members_network_role_idx
  ON public.network_members(network_id, role)
  WHERE revoked_at IS NULL;
