-- Allow technicians to move stock during Top Up + Add Parts flows.
-- After secure-all-rls.sql, public.inventory UPDATE is admin-only — technician PWA
-- top-up and add-parts hit "Cannot coerce the result to a single JSON object"
-- because RLS strips the RETURNING row from .update().select().single().
--
-- Two SECURITY DEFINER RPCs do the writes server-side with validation.
-- Safe to re-run.

-- Decrement main inventory by p_qty for the calling authenticated user.
-- Used by JobPartsUsedDialog (Add Parts on completed job) for technicians.
CREATE OR REPLACE FUNCTION public.decrement_main_inventory_for_job(
  p_inventory_id uuid,
  p_qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'invalid qty';
  END IF;

  SELECT quantity INTO v_current
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'inventory item not found';
  END IF;
  IF v_current < p_qty THEN
    RAISE EXCEPTION 'insufficient main stock: have %, need %', v_current, p_qty;
  END IF;

  UPDATE public.inventory
  SET quantity = quantity - p_qty
  WHERE id = p_inventory_id;

  RETURN jsonb_build_object(
    'inventory_id', p_inventory_id,
    'quantity_after', v_current - p_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_main_inventory_for_job(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_main_inventory_for_job(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.decrement_main_inventory_for_job(uuid, integer) TO authenticated;

-- Top Up: move p_qty from main inventory to the calling technician's inventory.
-- Used by TechnicianTopUpDialog ("Add to Inventory" button).
CREATE OR REPLACE FUNCTION public.technician_top_up_used_item(
  p_inventory_id uuid,
  p_qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech uuid := auth.uid();
  v_current integer;
  v_existing_id uuid;
BEGIN
  IF v_tech IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.technicians t WHERE t.id = v_tech) THEN
    RAISE EXCEPTION 'not a technician';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'invalid qty';
  END IF;

  SELECT quantity INTO v_current
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'inventory item not found';
  END IF;
  IF v_current < p_qty THEN
    RAISE EXCEPTION 'insufficient main stock: have %, need %', v_current, p_qty;
  END IF;

  UPDATE public.inventory
  SET quantity = quantity - p_qty
  WHERE id = p_inventory_id;

  SELECT id INTO v_existing_id
  FROM public.technician_inventory
  WHERE technician_id = v_tech
    AND inventory_id = p_inventory_id
  FOR UPDATE;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.technician_inventory (technician_id, inventory_id, quantity)
    VALUES (v_tech, p_inventory_id, p_qty);
  ELSE
    UPDATE public.technician_inventory
    SET quantity = quantity + p_qty
    WHERE id = v_existing_id;
  END IF;

  RETURN jsonb_build_object(
    'inventory_id', p_inventory_id,
    'qty_added', p_qty,
    'main_quantity_after', v_current - p_qty
  );
END;
$$;

REVOKE ALL ON FUNCTION public.technician_top_up_used_item(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.technician_top_up_used_item(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.technician_top_up_used_item(uuid, integer) TO authenticated;
