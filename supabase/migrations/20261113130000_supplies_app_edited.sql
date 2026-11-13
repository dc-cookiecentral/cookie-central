-- ─────────────────────────────────────────────────────────────────────────
-- Supplies: mark rows edited in the app, so the seed never reverts them
-- (docs/SUPPLIES_SPEC.md, "V2.2 — edit in the app")
--
-- The supplies seed (scripts/build-supplies-seed.mjs) upserts the rows it
-- created: ON CONFLICT (id) DO UPDATE. Once vendors, contacts, items, SKUs and
-- quotes can be edited in the app, a later seed paste would silently put the
-- old values back. Every app write now stamps app_edited_at; the seed's
-- DO UPDATE is guarded with WHERE app_edited_at IS NULL, and it leaves the
-- price breaks of an app-edited quote alone.
--
-- NULL = only ever written by the seed. Rows created in the app carry it from
-- the start (they have random ids the seed never produces anyway).
--
-- Verify:
--   SELECT 'vendors', count(*) FILTER (WHERE app_edited_at IS NOT NULL) FROM vendors;
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE vendors         ADD COLUMN IF NOT EXISTS app_edited_at timestamptz;
ALTER TABLE vendor_contacts ADD COLUMN IF NOT EXISTS app_edited_at timestamptz;
ALTER TABLE supply_items    ADD COLUMN IF NOT EXISTS app_edited_at timestamptz;
ALTER TABLE supply_skus     ADD COLUMN IF NOT EXISTS app_edited_at timestamptz;
ALTER TABLE quotes          ADD COLUMN IF NOT EXISTS app_edited_at timestamptz;

COMMENT ON COLUMN quotes.app_edited_at IS
  'Set by the app on every add/edit. The supplies seed never updates a row (or a quote''s breaks) where this is set.';

-- The field-level audit skips app_edited_at (like updated_at): it is
-- bookkeeping, and the change it marks is already logged column by column.
CREATE OR REPLACE FUNCTION log_supplies_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o jsonb;
  n jsonb;
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action)
    VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'INSERT');
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_value)
    VALUES (auth.uid(), TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD)::text);
  ELSE
    o := to_jsonb(OLD);
    n := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF k NOT IN ('updated_at', 'app_edited_at') AND (o -> k) IS DISTINCT FROM (n -> k) THEN
        INSERT INTO audit_log (user_id, table_name, record_id, action, field_name, old_value, new_value)
        VALUES (auth.uid(), TG_TABLE_NAME, NEW.id, 'UPDATE', k, o ->> k, n ->> k);
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
