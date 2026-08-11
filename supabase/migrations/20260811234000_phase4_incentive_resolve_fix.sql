-- Phase 4 fix: resolve PERCENT_OF_SALES / FIXED_PER_QTY / FIXED_PER_CONVERTED_PARTY
-- and simplify post-sale incentive upsert (no duplicate insert/delete race).

CREATE OR REPLACE FUNCTION public.crm_resolve_incentive_for_sale(p_sale_id UUID)
RETURNS TABLE (
  rule_id UUID,
  incentive_rate NUMERIC,
  calculated_amount NUMERIC,
  notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.crm_sales%ROWTYPE;
  v_rule public.crm_incentive_rules%ROWTYPE;
  v_product_rate NUMERIC;
  v_month TEXT;
  v_month_sales NUMERIC;
  v_target NUMERIC;
  v_ach_pct NUMERIC;
  v_slab JSONB;
  v_rate NUMERIC := 0;
  v_amount NUMERIC := 0;
BEGIN
  SELECT * INTO v_sale FROM public.crm_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_month := public.crm_year_month(v_sale.sale_date);

  -- 1) Product-specific percent rule
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'PRODUCT_SPECIFIC'
    AND r.product_id = v_sale.product_id
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.percent_rate IS NOT NULL THEN
    v_rate := v_rule.percent_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Product-specific % of sales value';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) Percent of sales (company / salesman scoped)
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'PERCENT_OF_SALES'
    AND (r.salesman_id IS NULL OR r.salesman_id = v_sale.salesman_id)
    AND (r.product_id IS NULL OR r.product_id = v_sale.product_id)
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.percent_rate IS NOT NULL THEN
    v_rate := v_rule.percent_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Percent of sales value';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3) Fixed per quantity
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'FIXED_PER_QTY'
    AND (r.product_id IS NULL OR r.product_id = v_sale.product_id)
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND AND v_rule.fixed_amount IS NOT NULL THEN
    v_rate := NULL;
    v_amount := ROUND(v_sale.quantity * v_rule.fixed_amount, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Fixed amount per quantity';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 4) Fallback: product.incentive_percent
  SELECT incentive_percent INTO v_product_rate FROM public.crm_products WHERE id = v_sale.product_id;
  IF COALESCE(v_product_rate, 0) > 0 THEN
    v_rate := v_product_rate;
    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := NULL;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := 'Product master incentive %';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 5) Target slab rule (company default)
  SELECT * INTO v_rule
  FROM public.crm_incentive_rules r
  WHERE r.company_id = v_sale.company_id
    AND r.is_active
    AND r.rule_type = 'TARGET_SLAB'
  ORDER BY r.priority
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(SUM(s.sales_value), 0) INTO v_month_sales
    FROM public.crm_sales s
    WHERE s.salesman_id = v_sale.salesman_id
      AND public.crm_year_month(s.sale_date) = v_month;

    SELECT COALESCE(st.sales_target, sm.monthly_target, 0) INTO v_target
    FROM public.crm_salesmen sm
    LEFT JOIN public.crm_salesman_targets st
      ON st.salesman_id = sm.id AND st.year_month = v_month AND st.product_id IS NULL
    WHERE sm.id = v_sale.salesman_id;

    IF v_target <= 0 THEN
      v_ach_pct := 0;
    ELSE
      v_ach_pct := (v_month_sales / v_target) * 100.0;
    END IF;

    FOR v_slab IN SELECT * FROM jsonb_array_elements(COALESCE(v_rule.slabs, '[]'::jsonb))
    LOOP
      IF v_ach_pct >= COALESCE((v_slab->>'min_pct')::NUMERIC, 0)
         AND v_ach_pct < COALESCE((v_slab->>'max_pct')::NUMERIC, 9999) THEN
        v_rate := COALESCE((v_slab->>'rate')::NUMERIC, 0);
        EXIT;
      END IF;
    END LOOP;

    v_amount := ROUND(v_sale.sales_value * v_rate / 100.0, 2);
    rule_id := v_rule.id;
    incentive_rate := v_rate;
    calculated_amount := v_amount;
    notes := format('Target slab at %s%% achievement', ROUND(v_ach_pct, 1));
    RETURN NEXT;
    RETURN;
  END IF;

  rule_id := NULL;
  incentive_rate := 0;
  calculated_amount := 0;
  notes := 'No matching incentive rule';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_after_sale_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty NUMERIC;
  v_val NUMERIC;
  v_last TIMESTAMPTZ;
  v_inc RECORD;
  v_month TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(sales_value),0), MAX(sale_date::timestamptz)
      INTO v_qty, v_val, v_last
    FROM public.crm_sales
    WHERE party_id = OLD.party_id AND product_id = OLD.product_id;

    UPDATE public.crm_party_products
    SET total_sales_qty = v_qty,
        total_sales_value = v_val,
        last_sale_at = v_last
    WHERE party_id = OLD.party_id AND product_id = OLD.product_id;

    DELETE FROM public.crm_incentive_calculations WHERE sale_id = OLD.id;
    RETURN OLD;
  END IF;

  PERFORM public.crm_set_party_product_status(
    NEW.party_id, NEW.product_id, 'PRODUCT_STARTED', 'sales', NEW.id, 'Sale recorded'
  );

  SELECT COALESCE(SUM(quantity),0), COALESCE(SUM(sales_value),0), MAX(sale_date::timestamptz)
    INTO v_qty, v_val, v_last
  FROM public.crm_sales
  WHERE party_id = NEW.party_id AND product_id = NEW.product_id;

  UPDATE public.crm_party_products
  SET total_sales_qty = v_qty,
      total_sales_value = v_val,
      last_sale_at = v_last,
      development_status = CASE
        WHEN development_status IN ('CONVERTED', 'REGULAR_SALE') THEN development_status
        WHEN v_val > 0 THEN 'PRODUCT_STARTED'::public.crm_dev_status
        ELSE development_status
      END
  WHERE party_id = NEW.party_id AND product_id = NEW.product_id;

  UPDATE public.crm_parties p
  SET current_business = COALESCE((
    SELECT SUM(s.sales_value) FROM public.crm_sales s WHERE s.party_id = p.id
  ), 0)
  WHERE p.id = NEW.party_id;

  v_month := public.crm_year_month(NEW.sale_date);
  SELECT * INTO v_inc FROM public.crm_resolve_incentive_for_sale(NEW.id);

  DELETE FROM public.crm_incentive_calculations
  WHERE sale_id = NEW.id AND status = 'ESTIMATED';

  INSERT INTO public.crm_incentive_calculations (
    company_id, salesman_id, product_id, sale_id, rule_id, year_month,
    sales_value, incentive_rate, calculated_amount, status, calculation_notes
  ) VALUES (
    NEW.company_id, NEW.salesman_id, NEW.product_id, NEW.id, v_inc.rule_id, v_month,
    NEW.sales_value, v_inc.incentive_rate, v_inc.calculated_amount, 'ESTIMATED', v_inc.notes
  );

  RETURN NEW;
END;
$$;
