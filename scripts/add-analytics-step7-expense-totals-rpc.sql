-- Step 7: pre-aggregated expense totals for CRM Analytics (replaces 4 row-level fetches).
-- Requires: public.is_admin_user()

CREATE OR REPLACE FUNCTION public.get_analytics_expense_totals(
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_technician_expenses numeric := 0;
  total_technician_advances numeric := 0;
  total_business_expenses numeric := 0;
  total_business_expenses_for_profit numeric := 0;
  total_business_expenses_for_profit_jobs_only numeric := 0;
  total_other_business_ledger_expenses numeric := 0;
  total_other_business_expenses numeric := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(sum(coalesce(amount, 0)), 0)
  INTO total_technician_expenses
  FROM public.technician_expenses e
  WHERE (p_start_date IS NULL OR e.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR e.expense_date <= p_end_date);

  SELECT coalesce(sum(coalesce(amount, 0)), 0)
  INTO total_technician_advances
  FROM public.technician_advances a
  WHERE (p_start_date IS NULL OR a.advance_date >= p_start_date)
    AND (p_end_date IS NULL OR a.advance_date <= p_end_date);

  SELECT
    coalesce(sum(coalesce(amount, 0)), 0),
    coalesce(sum(coalesce(amount, 0)) FILTER (
      WHERE upper(coalesce(btrim(category), '')) IN ('JOB_COST', 'BUSINESS')
    ), 0),
    coalesce(sum(coalesce(amount, 0)) FILTER (
      WHERE upper(coalesce(btrim(category), '')) = 'JOB_COST'
    ), 0),
    coalesce(sum(coalesce(amount, 0)) FILTER (
      WHERE upper(coalesce(btrim(category), '')) = 'OTHER_BUSINESS_EXPENSE'
    ), 0)
  INTO
    total_business_expenses,
    total_business_expenses_for_profit,
    total_business_expenses_for_profit_jobs_only,
    total_other_business_ledger_expenses
  FROM public.business_expenses b
  WHERE (p_start_date IS NULL OR b.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR b.expense_date <= p_end_date);

  SELECT coalesce(sum(coalesce(amount, 0)), 0)
  INTO total_other_business_expenses
  FROM public.other_expenses o
  WHERE (p_start_date IS NULL OR o.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR o.expense_date <= p_end_date);

  RETURN jsonb_build_object(
    'total_technician_expenses', total_technician_expenses,
    'total_technician_advances', total_technician_advances,
    'total_business_expenses', total_business_expenses,
    'total_business_expenses_for_profit', total_business_expenses_for_profit,
    'total_business_expenses_for_profit_jobs_only', total_business_expenses_for_profit_jobs_only,
    'total_other_business_ledger_expenses', total_other_business_ledger_expenses,
    'total_other_business_expenses', total_other_business_expenses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_expense_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_analytics_expense_totals(date, date) TO authenticated;
