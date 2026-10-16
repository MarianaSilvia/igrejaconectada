-- Storage hardening applied in production.
-- Supabase migration: restrict_legacy_asset_bucket
-- The legacy bucket is retained for recovery, but is no longer public and
-- accepts only image formats for future uploads.

update storage.buckets
set public = false,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'church-gp-assets';
