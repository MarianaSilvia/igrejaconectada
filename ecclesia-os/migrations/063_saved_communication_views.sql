ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_kind_check;
ALTER TABLE saved_views
  ADD CONSTRAINT saved_views_kind_check
  CHECK (kind IN ('people','events','tasks','communication'));
