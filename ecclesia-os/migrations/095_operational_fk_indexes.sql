BEGIN;

CREATE INDEX IF NOT EXISTS church_pix_settings_created_by_idx
  ON public.church_pix_settings (created_by);
CREATE INDEX IF NOT EXISTS church_pix_settings_updated_by_idx
  ON public.church_pix_settings (updated_by);
CREATE INDEX IF NOT EXISTS historical_events_created_by_idx
  ON public.historical_events (created_by);
CREATE INDEX IF NOT EXISTS member_access_credentials_person_id_idx
  ON public.member_access_credentials (person_id);
CREATE INDEX IF NOT EXISTS member_access_credentials_user_church_idx
  ON public.member_access_credentials (user_id, church_id);
CREATE INDEX IF NOT EXISTS member_access_credentials_user_id_idx
  ON public.member_access_credentials (user_id);

COMMIT;