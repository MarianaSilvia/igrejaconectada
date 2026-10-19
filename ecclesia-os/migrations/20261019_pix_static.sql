-- Static Pix settings per church. No bank provider, webhook or automatic settlement.
CREATE TABLE IF NOT EXISTS public.church_pix_settings (
  church_id uuid PRIMARY KEY REFERENCES public.churches(id) ON DELETE CASCADE,
  pix_key text NOT NULL,
  pix_key_type text NOT NULL CHECK (pix_key_type IN ('cpf','cnpj','email','phone','random')),
  merchant_name text NOT NULL,
  merchant_city text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  public_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.church_pix_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_pix_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS church_pix_settings_read ON public.church_pix_settings;
CREATE POLICY church_pix_settings_read ON public.church_pix_settings
  FOR SELECT TO ecclesia_app
  USING (
    church_id = tenant_id()
    AND (public_enabled OR can_access('finance', false))
  );

DROP POLICY IF EXISTS church_pix_settings_write ON public.church_pix_settings;
CREATE POLICY church_pix_settings_write ON public.church_pix_settings
  FOR INSERT TO ecclesia_app
  WITH CHECK (church_id = tenant_id() AND can_access('finance', true));

DROP POLICY IF EXISTS church_pix_settings_update ON public.church_pix_settings;
CREATE POLICY church_pix_settings_update ON public.church_pix_settings
  FOR UPDATE TO ecclesia_app
  USING (church_id = tenant_id() AND can_access('finance', true))
  WITH CHECK (church_id = tenant_id() AND can_access('finance', true));

GRANT SELECT, INSERT, UPDATE ON public.church_pix_settings TO ecclesia_app;
GRANT ALL ON public.church_pix_settings TO ecclesia_service;
