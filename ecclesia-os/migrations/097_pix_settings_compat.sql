-- Bridge the legacy Pix settings table to the static Pix columns.
ALTER TABLE public.church_pix_settings
  ADD COLUMN IF NOT EXISTS merchant_name text NOT NULL DEFAULT 'Igreja',
  ADD COLUMN IF NOT EXISTS merchant_city text NOT NULL DEFAULT 'Cidade',
  ADD COLUMN IF NOT EXISTS public_enabled boolean NOT NULL DEFAULT false;

UPDATE public.church_pix_settings
SET merchant_name=COALESCE(NULLIF(merchant_name,''), NULLIF(institution_name,''), 'Igreja'),
    merchant_city=COALESCE(NULLIF(merchant_city,''), NULLIF(city,''), 'Cidade'),
    public_enabled=COALESCE(public_enabled, portal_visible, enabled, false);

ALTER TABLE public.church_pix_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_pix_settings FORCE ROW LEVEL SECURITY;