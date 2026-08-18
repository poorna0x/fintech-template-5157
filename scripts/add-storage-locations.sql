-- Warehouse places → boxes (stackable) → items map.
-- Location ledger only — does NOT change inventory.quantity.
-- Run in Supabase SQL Editor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.storage_places (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  name character varying(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.storage_blocks (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  place_id uuid NOT NULL REFERENCES public.storage_places(id) ON DELETE CASCADE,
  name character varying(255) NOT NULL,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  -- NULL = on the floor (root of a stack). Otherwise the box directly underneath.
  parent_block_id uuid REFERENCES public.storage_blocks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_blocks_not_self_parent CHECK (parent_block_id IS NULL OR parent_block_id <> id)
);

CREATE TABLE IF NOT EXISTS public.storage_block_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  block_id uuid NOT NULL REFERENCES public.storage_blocks(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_block_items_quantity_check CHECK (quantity >= 0),
  CONSTRAINT storage_block_items_unique UNIQUE (block_id, inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_storage_places_sort ON public.storage_places (sort_order, name);
CREATE INDEX IF NOT EXISTS idx_storage_blocks_place ON public.storage_blocks (place_id, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_storage_blocks_parent ON public.storage_blocks (parent_block_id);
CREATE INDEX IF NOT EXISTS idx_storage_block_items_block ON public.storage_block_items (block_id);
CREATE INDEX IF NOT EXISTS idx_storage_block_items_inventory ON public.storage_block_items (inventory_id);

-- Keep parent in the same place (and clear invalid parents).
CREATE OR REPLACE FUNCTION public.storage_blocks_enforce_same_place()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_place uuid;
BEGIN
  IF NEW.parent_block_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_block_id = NEW.id THEN
    RAISE EXCEPTION 'A box cannot be stacked on itself';
  END IF;
  SELECT place_id INTO parent_place
  FROM public.storage_blocks
  WHERE id = NEW.parent_block_id;
  IF parent_place IS NULL THEN
    RAISE EXCEPTION 'Parent box not found';
  END IF;
  IF parent_place <> NEW.place_id THEN
    RAISE EXCEPTION 'Stacked boxes must be in the same place';
  END IF;
  -- Prevent short cycles: walking up from parent must not hit NEW.id
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_block_id FROM public.storage_blocks WHERE id = NEW.parent_block_id
      UNION ALL
      SELECT b.id, b.parent_block_id
      FROM public.storage_blocks b
      INNER JOIN ancestors a ON b.id = a.parent_block_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot create a cycle in box stacks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_storage_blocks_same_place ON public.storage_blocks;
CREATE TRIGGER trg_storage_blocks_same_place
  BEFORE INSERT OR UPDATE OF parent_block_id, place_id
  ON public.storage_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.storage_blocks_enforce_same_place();

-- When a box moves to another place, clear its stack link and unstack children in old place.
CREATE OR REPLACE FUNCTION public.storage_blocks_on_place_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.place_id IS DISTINCT FROM OLD.place_id THEN
    NEW.parent_block_id := NULL;
    UPDATE public.storage_blocks
    SET parent_block_id = NULL, updated_at = now()
    WHERE parent_block_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_storage_blocks_place_change ON public.storage_blocks;
CREATE TRIGGER trg_storage_blocks_place_change
  BEFORE UPDATE OF place_id
  ON public.storage_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.storage_blocks_on_place_change();

ALTER TABLE public.storage_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_block_items ENABLE ROW LEVEL SECURITY;

-- Authenticated read, admin write (same pattern as inventory catalog).
DROP POLICY IF EXISTS storage_places_select_auth ON public.storage_places;
DROP POLICY IF EXISTS storage_places_admin_insert ON public.storage_places;
DROP POLICY IF EXISTS storage_places_admin_update ON public.storage_places;
DROP POLICY IF EXISTS storage_places_admin_delete ON public.storage_places;

CREATE POLICY storage_places_select_auth ON public.storage_places
  FOR SELECT TO authenticated USING (public.is_admin_user() OR public.is_active_technician());
CREATE POLICY storage_places_admin_insert ON public.storage_places
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY storage_places_admin_update ON public.storage_places
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY storage_places_admin_delete ON public.storage_places
  FOR DELETE TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS storage_blocks_select_auth ON public.storage_blocks;
DROP POLICY IF EXISTS storage_blocks_admin_insert ON public.storage_blocks;
DROP POLICY IF EXISTS storage_blocks_admin_update ON public.storage_blocks;
DROP POLICY IF EXISTS storage_blocks_admin_delete ON public.storage_blocks;

CREATE POLICY storage_blocks_select_auth ON public.storage_blocks
  FOR SELECT TO authenticated USING (public.is_admin_user() OR public.is_active_technician());
CREATE POLICY storage_blocks_admin_insert ON public.storage_blocks
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY storage_blocks_admin_update ON public.storage_blocks
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY storage_blocks_admin_delete ON public.storage_blocks
  FOR DELETE TO authenticated USING (public.is_admin_user());

DROP POLICY IF EXISTS storage_block_items_select_auth ON public.storage_block_items;
DROP POLICY IF EXISTS storage_block_items_admin_insert ON public.storage_block_items;
DROP POLICY IF EXISTS storage_block_items_admin_update ON public.storage_block_items;
DROP POLICY IF EXISTS storage_block_items_admin_delete ON public.storage_block_items;

CREATE POLICY storage_block_items_select_auth ON public.storage_block_items
  FOR SELECT TO authenticated USING (public.is_admin_user() OR public.is_active_technician());
CREATE POLICY storage_block_items_admin_insert ON public.storage_block_items
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_user());
CREATE POLICY storage_block_items_admin_update ON public.storage_block_items
  FOR UPDATE TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY storage_block_items_admin_delete ON public.storage_block_items
  FOR DELETE TO authenticated USING (public.is_admin_user());

REVOKE ALL ON public.storage_places FROM anon, public;
REVOKE ALL ON public.storage_blocks FROM anon, public;
REVOKE ALL ON public.storage_block_items FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_block_items TO authenticated;

COMMENT ON TABLE public.storage_places IS 'Named warehouse rooms/places for physical stock location map';
COMMENT ON TABLE public.storage_blocks IS 'Named boxes in a place; parent_block_id stacks one box on another';
COMMENT ON TABLE public.storage_block_items IS 'Products + qty inside a box (location ledger; independent of inventory.quantity)';
