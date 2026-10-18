DO $$
DECLARE
  fk record;
  index_name text;
BEGIN
  FOR fk IN
    SELECT
      con.oid AS constraint_oid,
      ns.nspname AS schema_name,
      tbl.relname AS table_name,
      con.conname AS constraint_name,
      tbl.oid AS table_oid,
      con.conkey AS key_attnums,
      string_agg(format('%I', att.attname), ', ' ORDER BY key_pos.ordinality) AS columns_sql
    FROM pg_constraint con
    JOIN pg_class tbl ON tbl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key_pos(attnum, ordinality) ON true
    JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = key_pos.attnum
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
    GROUP BY con.oid, ns.nspname, tbl.relname, con.conname, tbl.oid, con.conkey
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index idx
      WHERE idx.indrelid = fk.table_oid
        AND idx.indisvalid
        AND idx.indnkeyatts >= array_length(fk.key_attnums, 1)
        AND (idx.indkey::smallint[])[1:array_length(fk.key_attnums, 1)] = fk.key_attnums
    ) THEN
      index_name := left(format('idx_fk_%s_%s', fk.table_name, fk.constraint_name), 55) || '_' || substr(md5(fk.constraint_name), 1, 7);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)', index_name, fk.schema_name, fk.table_name, fk.columns_sql);
    END IF;
  END LOOP;
END $$;
