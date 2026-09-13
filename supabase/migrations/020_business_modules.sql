BEGIN;

-- Existing and newly created businesses retain all modules until explicitly configured.
ALTER TABLE public.businesses
  ADD COLUMN enabled_modules text[] NOT NULL DEFAULT ARRAY['pos','repairs','inventory','purchases','expenses','accounting','reports']::text[],
  ADD COLUMN modules_revision integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT business_modules_valid CHECK (
    enabled_modules <@ ARRAY['pos','repairs','inventory','purchases','expenses','accounting','reports']::text[]
    AND array_position(enabled_modules, NULL) IS NULL AND cardinality(enabled_modules) <= 7
  );

-- Preserve 019's limited contact-field grants: clients cannot change entitlements.
REVOKE UPDATE ON public.businesses FROM authenticated, anon;
REVOKE UPDATE (enabled_modules, modules_revision) ON public.businesses FROM authenticated, anon;
GRANT UPDATE (name, phone, email, address, currency_code, timezone) ON public.businesses TO authenticated;

CREATE FUNCTION public.my_business_modules()
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result text[];
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RAISE EXCEPTION 'Business staff access required' USING ERRCODE = '42501';
  END IF;
  SELECT b.enabled_modules INTO result FROM public.businesses b
  WHERE b.id = public.current_business_id() AND b.active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active business required' USING ERRCODE = '42501'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.require_business_module(p_module text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE modules text[]; business uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN
    RAISE EXCEPTION 'Business staff access required' USING ERRCODE = '42501';
  END IF;
  business := public.current_business_id();
  -- Serialize operations against module changes. An in-flight operation finishes
  -- before disabling returns; requests begun after that cannot write this module.
  SELECT b.enabled_modules INTO modules FROM public.businesses b
  WHERE b.id = business AND b.active FOR SHARE;
  IF NOT FOUND OR p_module IS NULL OR NOT (p_module = ANY(modules)) THEN
    RAISE EXCEPTION 'Module not enabled: %', p_module USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.platform_get_business_modules(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object('name', name, 'modules', enabled_modules, 'revision', modules_revision)
    FROM public.businesses WHERE id = p_id);
END;
$$;

CREATE FUNCTION public.platform_set_business_modules(p_id uuid, p_expected_revision integer, p_modules text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END IF;
  IF p_modules IS NULL OR array_position(p_modules, NULL) IS NOT NULL
    OR cardinality(p_modules) > 7 OR coalesce(array_ndims(p_modules),1) <> 1
    OR NOT (p_modules <@ ARRAY['pos','repairs','inventory','purchases','expenses','accounting','reports']::text[])
    OR cardinality(p_modules) <> (SELECT count(DISTINCT m) FROM unnest(p_modules) m) THEN
    RAISE EXCEPTION 'Invalid module selection' USING ERRCODE = '22023';
  END IF;
  UPDATE public.businesses SET enabled_modules = p_modules, modules_revision = modules_revision + 1
  WHERE id = p_id AND modules_revision = p_expected_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Modules changed; refresh and retry' USING ERRCODE = '40001'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.my_business_modules(), public.require_business_module(text),
  public.platform_get_business_modules(uuid), public.platform_set_business_modules(uuid,integer,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_business_modules(), public.require_business_module(text),
  public.platform_get_business_modules(uuid), public.platform_set_business_modules(uuid,integer,text[]) TO authenticated;

-- Direct-table writes must also be guarded, not only RPCs. These tables have
-- authenticated write grants. SELECT policies are unchanged to retain history.
CREATE FUNCTION public.enforce_module_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.require_business_module(TG_ARGV[0]);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_module_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER purchase_orders_module_write BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_module_write('purchases');
CREATE TRIGGER purchase_order_lines_module_write BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_module_write('purchases');
CREATE TRIGGER expense_categories_module_write BEFORE INSERT OR UPDATE OR DELETE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_module_write('expenses');

-- Guarded copies of existing transaction RPCs; original logic preserved.
-- create_purchase_order: purchases
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_purchase_order' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='1c88a02e84f6970988ad7e2e7f997d6e') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for create_purchase_order. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.create_purchase_order(p_supplier_id uuid,p_order_date date,p_expected_date date,p_supplier_reference text,p_notes text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_role public.user_role:=public.current_user_role(); v_order_id uuid; v_number text; v_item jsonb; v_qty numeric; v_cost numeric; v_discount numeric; v_tax numeric; v_base numeric; v_net numeric; v_subtotal numeric:=0; v_discount_total numeric:=0; v_tax_total numeric:=0; v_grand_total numeric:=0; v_branch uuid;
begin
  PERFORM public.require_business_module('purchases');

  if v_role not in ('admin','manager') then raise exception 'Not authorized to create purchases'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and business_id=v_business and active) then raise exception 'Invalid supplier'; end if;
  select branch_id into v_branch from public.profiles where id=auth.uid();
  v_number:='PO-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.purchase_orders(business_id,branch_id,supplier_id,order_number,order_date,expected_date,supplier_reference,notes,created_by) values(v_business,v_branch,p_supplier_id,v_number,coalesce(p_order_date,current_date),p_expected_date,nullif(trim(p_supplier_reference),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    v_qty:=(v_item->>'quantity')::numeric; v_cost:=(v_item->>'unit_cost')::numeric; v_discount:=coalesce((v_item->>'discount_percent')::numeric,0); v_tax:=coalesce((v_item->>'tax_percent')::numeric,0);
    if v_qty<=0 or v_cost<0 then raise exception 'Invalid quantity or cost'; end if;
    if not exists(select 1 from public.products where id=(v_item->>'product_id')::uuid and business_id=v_business and active and product_type='stockable') then raise exception 'Invalid stockable product'; end if;
    v_base:=v_qty*v_cost; v_net:=v_base-(v_base*v_discount/100); v_subtotal:=v_subtotal+v_base; v_discount_total:=v_discount_total+(v_base*v_discount/100); v_tax_total:=v_tax_total+(v_net*v_tax/100); v_grand_total:=v_grand_total+v_net+(v_net*v_tax/100);
    insert into public.purchase_order_lines(business_id,purchase_order_id,product_id,ordered_qty,unit_cost,discount_percent,tax_percent,line_total) values(v_business,v_order_id,(v_item->>'product_id')::uuid,v_qty,v_cost,v_discount,v_tax,round(v_net+(v_net*v_tax/100),2));
  end loop;
  if not exists(select 1 from public.purchase_order_lines where purchase_order_id=v_order_id) then raise exception 'Add at least one product'; end if;
  update public.purchase_orders set subtotal=round(v_subtotal,2),discount_total=round(v_discount_total,2),tax_total=round(v_tax_total,2),grand_total=round(v_grand_total,2) where id=v_order_id;
  return v_order_id;
end; $$;

-- receive_purchase_order: purchases
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='receive_purchase_order' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='76e122d4c662625adf785964cf1810c9') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for receive_purchase_order. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.receive_purchase_order(p_order_id uuid,p_lines jsonb,p_supplier_document text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_role public.user_role:=public.current_user_role(); v_order public.purchase_orders%rowtype; v_item jsonb; v_line public.purchase_order_lines%rowtype; v_qty numeric; v_receipt_id uuid; v_receipt_number text; v_old_qty numeric; v_old_cost numeric; v_new_cost numeric;
begin
  PERFORM public.require_business_module('purchases');

  if v_role not in ('admin','manager') then raise exception 'Not authorized to receive purchases'; end if;
  select * into v_order from public.purchase_orders where id=p_order_id and business_id=v_business for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_order.status not in ('confirmed','partially_received') then raise exception 'Only confirmed orders can be received'; end if;
  v_receipt_number:='GRN-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.goods_receipts(business_id,purchase_order_id,receipt_number,supplier_document,notes,received_by) values(v_business,p_order_id,v_receipt_number,nullif(trim(p_supplier_document),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_receipt_id;
  for v_item in select * from jsonb_array_elements(p_lines) loop
    v_qty:=(v_item->>'quantity')::numeric;
    if v_qty<=0 then continue; end if;
    select * into v_line from public.purchase_order_lines where id=(v_item->>'line_id')::uuid and purchase_order_id=p_order_id and business_id=v_business for update;
    if not found or v_line.received_qty+v_qty>v_line.ordered_qty then raise exception 'Invalid received quantity'; end if;
    insert into public.goods_receipt_lines(business_id,goods_receipt_id,purchase_order_line_id,product_id,received_qty,unit_cost) values(v_business,v_receipt_id,v_line.id,v_line.product_id,v_qty,v_line.unit_cost);
    update public.purchase_order_lines set received_qty=received_qty+v_qty where id=v_line.id;
    select quantity,average_cost into v_old_qty,v_old_cost from public.stock_balances where business_id=v_business and branch_id is not distinct from v_order.branch_id and product_id=v_line.product_id for update;
    if not found then v_old_qty:=0; v_old_cost:=0; end if;
    v_new_cost:=case when v_old_qty+v_qty>0 then round(((v_old_qty*v_old_cost)+(v_qty*v_line.unit_cost))/(v_old_qty+v_qty),2) else v_line.unit_cost end;
    insert into public.stock_balances(business_id,branch_id,product_id,quantity,average_cost) values(v_business,v_order.branch_id,v_line.product_id,v_qty,v_new_cost) on conflict (business_id,branch_id,product_id) do update set quantity=public.stock_balances.quantity+excluded.quantity,average_cost=excluded.average_cost,updated_at=now();
    insert into public.stock_movements(business_id,branch_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,reference_number,created_by) values(v_business,v_order.branch_id,v_line.product_id,'purchase_receipt',v_qty,v_line.unit_cost,'goods_receipt',v_receipt_id,v_receipt_number,auth.uid());
    update public.products set cost_price=v_new_cost where id=v_line.product_id and business_id=v_business;
  end loop;
  if not exists(select 1 from public.goods_receipt_lines where goods_receipt_id=v_receipt_id) then raise exception 'Enter at least one quantity'; end if;
  update public.purchase_orders set status=case when exists(select 1 from public.purchase_order_lines where purchase_order_id=p_order_id and received_qty<ordered_qty) then 'partially_received'::public.purchase_status else 'received'::public.purchase_status end where id=p_order_id;
  return v_receipt_id;
end; $$;

-- adjust_inventory: inventory
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='adjust_inventory' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='d8d0c96c95fdba5207f73e9e7800fb32') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for adjust_inventory. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.adjust_inventory(
  p_branch_id uuid,
  p_product_id uuid,
  p_adjustment_type text,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_role text;
  v_current_quantity numeric := 0;
  v_current_cost numeric := 0;
  v_new_quantity numeric := 0;
  v_new_cost numeric := 0;
  v_movement_quantity numeric := 0;
  v_reference_number text;
  v_stock_balance_id uuid;
  v_movement_id uuid;
begin
  PERFORM public.require_business_module('inventory');

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_business_id := public.current_business_id();
  v_role := public.current_user_role();

  if v_business_id is null then
    raise exception 'The current user is not linked to a business.';
  end if;

  if v_role not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can adjust inventory.';
  end if;

  if p_adjustment_type not in ('adjustment_in', 'adjustment_out') then
    raise exception 'Invalid adjustment type.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Unit cost cannot be negative.';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'An adjustment reason is required.';
  end if;

  if not exists (
    select 1
    from public.branches
    where id = p_branch_id
      and business_id = v_business_id
  ) then
    raise exception 'Invalid branch.';
  end if;

  if not exists (
    select 1
    from public.products
    where id = p_product_id
      and business_id = v_business_id
      and product_type = 'stockable'
  ) then
    raise exception 'Select a valid stock product.';
  end if;

  select
    id,
    quantity,
    average_cost
  into
    v_stock_balance_id,
    v_current_quantity,
    v_current_cost
  from public.stock_balances
  where business_id = v_business_id
    and branch_id = p_branch_id
    and product_id = p_product_id
  for update;

  if not found then
    v_stock_balance_id := null;
    v_current_quantity := 0;
    v_current_cost := 0;
  end if;

  if p_adjustment_type = 'adjustment_in' then
    v_movement_quantity := p_quantity;
    v_new_quantity := v_current_quantity + p_quantity;

    if coalesce(p_unit_cost, 0) > 0 then
      if v_current_quantity > 0 then
        v_new_cost :=
          (
            (v_current_quantity * v_current_cost) +
            (p_quantity * p_unit_cost)
          ) / v_new_quantity;
      else
        v_new_cost := p_unit_cost;
      end if;
    else
      v_new_cost := v_current_cost;
    end if;
  else
    if p_quantity > v_current_quantity then
      raise exception
        'Insufficient stock. Available quantity: %',
        v_current_quantity;
    end if;

    v_movement_quantity := -p_quantity;
    v_new_quantity := v_current_quantity - p_quantity;
    v_new_cost := v_current_cost;
  end if;

  insert into public.stock_balances (
    business_id,
    branch_id,
    product_id,
    quantity,
    average_cost
  )
  values (
    v_business_id,
    p_branch_id,
    p_product_id,
    v_new_quantity,
    v_new_cost
  )
  on conflict (business_id, branch_id, product_id)
  do update set
    quantity = excluded.quantity,
    average_cost = excluded.average_cost,
    updated_at = now()
  returning id into v_stock_balance_id;

  v_reference_number :=
    'ADJ-' ||
    to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.stock_movements (
    business_id,
    branch_id,
    product_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    reference_number,
    movement_date,
    created_by
  )
  values (
    v_business_id,
    p_branch_id,
    p_product_id,
    p_adjustment_type,
    v_movement_quantity,
    v_new_cost,
    'inventory_adjustment',
    null,
    v_reference_number,
    current_date,
    auth.uid()
  )
  returning id into v_movement_id;

  return jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'reference_number', v_reference_number,
    'previous_quantity', v_current_quantity,
    'adjusted_quantity', v_movement_quantity,
    'new_quantity', v_new_quantity,
    'average_cost', v_new_cost
  );
end;
$$;

-- transfer_inventory: inventory
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='transfer_inventory' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='62e0271378144237fabb9df96f143f35') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for transfer_inventory. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.transfer_inventory(
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_role text;

  v_source_quantity numeric := 0;
  v_source_cost numeric := 0;
  v_source_new_quantity numeric := 0;

  v_destination_quantity numeric := 0;
  v_destination_cost numeric := 0;
  v_destination_new_quantity numeric := 0;
  v_destination_new_cost numeric := 0;

  v_reference_number text;
  v_transfer_out_id uuid;
  v_transfer_in_id uuid;
begin
  PERFORM public.require_business_module('inventory');

  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  v_business_id := public.current_business_id();
  v_role := public.current_user_role();

  if v_business_id is null then
    raise exception 'The current user is not linked to a business.';
  end if;

  if v_role not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can transfer stock.';
  end if;

  if p_from_branch_id is null or p_to_branch_id is null then
    raise exception 'Source and destination branches are required.';
  end if;

  if p_from_branch_id = p_to_branch_id then
    raise exception 'Source and destination branches cannot be the same.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero.';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A transfer reason is required.';
  end if;

  if not exists (
    select 1
    from public.branches
    where id = p_from_branch_id
      and business_id = v_business_id
      and active = true
  ) then
    raise exception 'Invalid source branch.';
  end if;

  if not exists (
    select 1
    from public.branches
    where id = p_to_branch_id
      and business_id = v_business_id
      and active = true
  ) then
    raise exception 'Invalid destination branch.';
  end if;

  if not exists (
    select 1
    from public.products
    where id = p_product_id
      and business_id = v_business_id
      and product_type = 'stockable'
  ) then
    raise exception 'Select a valid stock product.';
  end if;

  select
    quantity,
    average_cost
  into
    v_source_quantity,
    v_source_cost
  from public.stock_balances
  where business_id = v_business_id
    and branch_id = p_from_branch_id
    and product_id = p_product_id
  for update;

  if not found then
    raise exception 'No stock is available in the source branch.';
  end if;

  if p_quantity > v_source_quantity then
    raise exception
      'Insufficient stock. Available quantity: %',
      v_source_quantity;
  end if;

  select
    quantity,
    average_cost
  into
    v_destination_quantity,
    v_destination_cost
  from public.stock_balances
  where business_id = v_business_id
    and branch_id = p_to_branch_id
    and product_id = p_product_id
  for update;

  if not found then
    v_destination_quantity := 0;
    v_destination_cost := 0;
  end if;

  v_source_new_quantity := v_source_quantity - p_quantity;
  v_destination_new_quantity := v_destination_quantity + p_quantity;

  if v_destination_quantity > 0 then
    v_destination_new_cost :=
      (
        (v_destination_quantity * v_destination_cost) +
        (p_quantity * v_source_cost)
      ) / v_destination_new_quantity;
  else
    v_destination_new_cost := v_source_cost;
  end if;

  update public.stock_balances
  set
    quantity = v_source_new_quantity,
    updated_at = now()
  where business_id = v_business_id
    and branch_id = p_from_branch_id
    and product_id = p_product_id;

  insert into public.stock_balances (
    business_id,
    branch_id,
    product_id,
    quantity,
    average_cost
  )
  values (
    v_business_id,
    p_to_branch_id,
    p_product_id,
    v_destination_new_quantity,
    v_destination_new_cost
  )
  on conflict (business_id, branch_id, product_id)
  do update set
    quantity = excluded.quantity,
    average_cost = excluded.average_cost,
    updated_at = now();

  v_reference_number :=
    'TRF-' ||
    to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.stock_movements (
    business_id,
    branch_id,
    product_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    reference_number,
    movement_date,
    created_by
  )
  values (
    v_business_id,
    p_from_branch_id,
    p_product_id,
    'transfer_out',
    -p_quantity,
    v_source_cost,
    'inventory_transfer',
    null,
    v_reference_number,
    current_date,
    auth.uid()
  )
  returning id into v_transfer_out_id;

  insert into public.stock_movements (
    business_id,
    branch_id,
    product_id,
    movement_type,
    quantity,
    unit_cost,
    reference_type,
    reference_id,
    reference_number,
    movement_date,
    created_by
  )
  values (
    v_business_id,
    p_to_branch_id,
    p_product_id,
    'transfer_in',
    p_quantity,
    v_source_cost,
    'inventory_transfer',
    null,
    v_reference_number,
    current_date,
    auth.uid()
  )
  returning id into v_transfer_in_id;

  return jsonb_build_object(
    'success', true,
    'reference_number', v_reference_number,
    'transfer_out_movement_id', v_transfer_out_id,
    'transfer_in_movement_id', v_transfer_in_id,
    'quantity', p_quantity,
    'unit_cost', v_source_cost,
    'source_new_quantity', v_source_new_quantity,
    'destination_new_quantity', v_destination_new_quantity
  );
end;
$$;

-- open_pos_session: pos
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='open_pos_session' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='09340efaff3b38c0701d04515c049035') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for open_pos_session. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.open_pos_session(
  p_opening_balance numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business_id();
  v_branch uuid;
  v_session uuid;
begin
  PERFORM public.require_business_module('pos');

  if v_business is null then raise exception 'User profile was not found'; end if;
  if coalesce(p_opening_balance,0) < 0 then raise exception 'Opening balance cannot be negative'; end if;

  select branch_id into v_branch from public.profiles where id = auth.uid();
  if v_branch is null then raise exception 'A branch must be assigned to the cashier'; end if;

  if exists (
    select 1 from public.pos_sessions
    where business_id = v_business and cashier_id = auth.uid() and status = 'open'
  ) then
    raise exception 'This cashier already has an open session';
  end if;

  insert into public.pos_sessions (
    business_id, branch_id, cashier_id, opening_balance, expected_cash, notes
  ) values (
    v_business, v_branch, auth.uid(), coalesce(p_opening_balance,0),
    coalesce(p_opening_balance,0), nullif(trim(p_notes),'')
  ) returning id into v_session;

  return v_session;
end;
$$;

-- create_pos_sale: pos
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_pos_sale' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='56296ac7697a80cbce0df970ae0b9319') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for create_pos_sale. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.create_pos_sale(
  p_session_id uuid,
  p_customer_id uuid,
  p_lines jsonb,
  p_payments jsonb,
  p_bill_discount numeric default 0,
  p_notes text default null,
  p_hold boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business_id();
  v_branch uuid;
  v_sale_id uuid;
  v_sale_number text;
  v_item jsonb;
  v_payment jsonb;
  v_product public.products%rowtype;
  v_qty numeric;
  v_price numeric;
  v_discount_percent numeric;
  v_tax_percent numeric;
  v_base numeric;
  v_discount_amount numeric;
  v_tax_amount numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_line_discount_total numeric := 0;
  v_tax_total numeric := 0;
  v_grand_total numeric := 0;
  v_paid_total numeric := 0;
  v_change numeric := 0;
  v_stock numeric;
  v_method public.pos_payment_methods%rowtype;
  v_amount numeric;
  v_tendered numeric;
begin
  PERFORM public.require_business_module('pos');

  if v_business is null then raise exception 'User profile was not found'; end if;
  if coalesce(jsonb_array_length(p_lines),0) = 0 then raise exception 'Add at least one item'; end if;
  if coalesce(p_bill_discount,0) < 0 then raise exception 'Bill discount cannot be negative'; end if;

  select branch_id into v_branch
  from public.pos_sessions
  where id = p_session_id and business_id = v_business
    and cashier_id = auth.uid() and status = 'open'
  for update;
  if v_branch is null then raise exception 'Open POS session was not found'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id = p_customer_id and business_id = v_business and active
  ) then raise exception 'Invalid customer'; end if;

  v_sale_number := 'POS-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.pos_sales (
    business_id, branch_id, session_id, customer_id, sale_number,
    status, notes, created_by, completed_at
  ) values (
    v_business, v_branch, p_session_id, p_customer_id, v_sale_number,
    case when p_hold then 'held'::public.pos_sale_status else 'completed'::public.pos_sale_status end,
    nullif(trim(p_notes),''), auth.uid(), case when p_hold then null else now() end
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_discount_percent := coalesce((v_item->>'discount_percent')::numeric,0);
    v_tax_percent := coalesce((v_item->>'tax_percent')::numeric,0);

    select * into v_product from public.products
    where id = (v_item->>'product_id')::uuid
      and business_id = v_business and active;
    if not found then raise exception 'Invalid or inactive product'; end if;
    if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
    if v_discount_percent not between 0 and 100
      or v_tax_percent not between 0 and 100 then
      raise exception 'Discount and tax must be between 0 and 100';
    end if;

    v_price := coalesce((v_item->>'unit_price')::numeric, v_product.selling_price);
    if v_price < 0 then raise exception 'Price cannot be negative'; end if;
    if v_price <> v_product.selling_price and not v_product.allow_price_change
      and public.current_user_role() not in ('admin','manager') then
      raise exception 'Price change is not allowed for %', v_product.name;
    end if;

    if not p_hold and v_product.product_type = 'stockable' then
      select quantity into v_stock from public.stock_balances
      where business_id = v_business and branch_id = v_branch
        and product_id = v_product.id for update;
      v_stock := coalesce(v_stock,0);
      if v_stock < v_qty then
        raise exception 'Insufficient stock for %. Available: %', v_product.name, v_stock;
      end if;
    end if;

    v_base := round(v_qty * v_price,2);
    v_discount_amount := round(v_base * v_discount_percent / 100,2);
    v_tax_amount := round((v_base - v_discount_amount) * v_tax_percent / 100,2);
    v_line_total := round(v_base - v_discount_amount + v_tax_amount,2);
    v_subtotal := v_subtotal + v_base;
    v_line_discount_total := v_line_discount_total + v_discount_amount;
    v_tax_total := v_tax_total + v_tax_amount;

    insert into public.pos_sale_lines (
      business_id, sale_id, product_id, description, quantity, unit_price,
      unit_cost, discount_percent, discount_amount, tax_percent, tax_amount, line_total
    ) values (
      v_business, v_sale_id, v_product.id, v_product.name, v_qty, v_price,
      v_product.cost_price, v_discount_percent, v_discount_amount,
      v_tax_percent, v_tax_amount, v_line_total
    );

    if not p_hold and v_product.product_type = 'stockable' then
      update public.stock_balances
      set quantity = quantity - v_qty, updated_at = now()
      where business_id = v_business and branch_id = v_branch
        and product_id = v_product.id;

      insert into public.stock_movements (
        business_id, branch_id, product_id, movement_type, quantity,
        unit_cost, reference_type, reference_id, reference_number, created_by
      ) values (
        v_business, v_branch, v_product.id, 'sale', -v_qty,
        v_product.cost_price, 'pos_sale', v_sale_id, v_sale_number, auth.uid()
      );
    end if;
  end loop;

  v_grand_total := round(
    v_subtotal - v_line_discount_total + v_tax_total - coalesce(p_bill_discount,0),2
  );
  if v_grand_total < 0 then raise exception 'Bill discount exceeds the bill value'; end if;

  if not p_hold then
    if coalesce(jsonb_array_length(p_payments),0) = 0 and v_grand_total > 0 then
      raise exception 'Add at least one payment';
    end if;

    for v_payment in select * from jsonb_array_elements(p_payments) loop
      select * into v_method from public.pos_payment_methods
      where id = (v_payment->>'payment_method_id')::uuid
        and business_id = v_business and active;
      if not found then raise exception 'Invalid payment method'; end if;

      v_amount := coalesce((v_payment->>'amount')::numeric,0);
      v_tendered := nullif(v_payment->>'tendered_amount','')::numeric;
      if v_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
      if v_method.payment_kind = 'credit' and p_customer_id is null then
        raise exception 'Select a customer for a credit sale';
      end if;

      insert into public.pos_sale_payments (
        business_id, sale_id, payment_method_id, amount, tendered_amount,
        reference_number, received_by
      ) values (
        v_business, v_sale_id, v_method.id, v_amount, v_tendered,
        nullif(trim(v_payment->>'reference_number'),''), auth.uid()
      );
      v_paid_total := v_paid_total + v_amount;
      if v_method.payment_kind = 'cash' and v_tendered is not null then
        v_change := v_change + greatest(v_tendered - v_amount,0);
      end if;
    end loop;

    if round(v_paid_total,2) <> v_grand_total then
      raise exception 'Payment total (%) must equal bill total (%)', v_paid_total, v_grand_total;
    end if;

    update public.pos_sessions
    set expected_cash = expected_cash + coalesce((
      select sum(sp.amount)
      from public.pos_sale_payments sp
      join public.pos_payment_methods pm on pm.id = sp.payment_method_id
      where sp.sale_id = v_sale_id and pm.payment_kind = 'cash'
    ),0)
    where id = p_session_id;
  end if;

  update public.pos_sales set
    subtotal = round(v_subtotal,2),
    line_discount_total = round(v_line_discount_total,2),
    bill_discount = round(coalesce(p_bill_discount,0),2),
    tax_total = round(v_tax_total,2),
    grand_total = v_grand_total,
    paid_total = round(v_paid_total,2),
    change_amount = round(v_change,2)
  where id = v_sale_id;

  return v_sale_id;
end;
$$;

-- close_pos_session: pos
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='close_pos_session' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='b92fffaeb9af16e7a0cb9c82b3b3a6bb') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for close_pos_session. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.close_pos_session(
  p_session_id uuid,
  p_closing_cash numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business_id();
  v_expected numeric;
begin
  PERFORM public.require_business_module('pos');

  if p_closing_cash < 0 then raise exception 'Closing cash cannot be negative'; end if;

  select expected_cash into v_expected from public.pos_sessions
  where id = p_session_id and business_id = v_business
    and cashier_id = auth.uid() and status = 'open'
  for update;
  if not found then raise exception 'Open POS session was not found'; end if;

  update public.pos_sessions set
    status = 'closed', closing_cash = p_closing_cash,
    cash_difference = round(p_closing_cash - v_expected,2),
    closed_at = now(), notes = coalesce(nullif(trim(p_notes),''), notes)
  where id = p_session_id;
end;
$$;

-- complete_held_pos_sale: pos
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='complete_held_pos_sale' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='18d6ca783ff4e8132325af38f6b65ac8') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for complete_held_pos_sale. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.complete_held_pos_sale(
  p_sale_id uuid,
  p_payments jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business_id();
  v_sale public.pos_sales%rowtype;
  v_line public.pos_sale_lines%rowtype;
  v_product public.products%rowtype;
  v_payment jsonb;
  v_method public.pos_payment_methods%rowtype;
  v_stock numeric;
  v_amount numeric;
  v_tendered numeric;
  v_paid_total numeric := 0;
  v_change numeric := 0;
begin
  PERFORM public.require_business_module('pos');

  select * into v_sale from public.pos_sales
  where id = p_sale_id and business_id = v_business and status = 'held'
  for update;
  if not found then raise exception 'Held sale was not found'; end if;

  if not exists (
    select 1 from public.pos_sessions
    where id = v_sale.session_id and business_id = v_business
      and cashier_id = auth.uid() and status = 'open'
  ) then raise exception 'The cashier must have an open POS session'; end if;

  if coalesce(jsonb_array_length(p_payments),0) = 0 and v_sale.grand_total > 0 then
    raise exception 'Add at least one payment';
  end if;

  for v_line in select * from public.pos_sale_lines where sale_id = v_sale.id loop
    select * into v_product from public.products
    where id = v_line.product_id and business_id = v_business and active;
    if not found then raise exception 'A product in this bill is no longer available'; end if;

    if v_product.product_type = 'stockable' then
      select quantity into v_stock from public.stock_balances
      where business_id = v_business and branch_id = v_sale.branch_id
        and product_id = v_product.id for update;
      if coalesce(v_stock,0) < v_line.quantity then
        raise exception 'Insufficient stock for %. Available: %', v_product.name, coalesce(v_stock,0);
      end if;

      update public.stock_balances set
        quantity = quantity - v_line.quantity, updated_at = now()
      where business_id = v_business and branch_id = v_sale.branch_id
        and product_id = v_product.id;

      insert into public.stock_movements (
        business_id, branch_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, reference_number, created_by
      ) values (
        v_business, v_sale.branch_id, v_product.id, 'sale', -v_line.quantity,
        v_line.unit_cost, 'pos_sale', v_sale.id, v_sale.sale_number, auth.uid()
      );
    end if;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    select * into v_method from public.pos_payment_methods
    where id = (v_payment->>'payment_method_id')::uuid
      and business_id = v_business and active;
    if not found then raise exception 'Invalid payment method'; end if;

    v_amount := coalesce((v_payment->>'amount')::numeric,0);
    v_tendered := nullif(v_payment->>'tendered_amount','')::numeric;
    if v_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
    if v_method.payment_kind = 'credit' and v_sale.customer_id is null then
      raise exception 'A customer is required for credit payment';
    end if;

    insert into public.pos_sale_payments (
      business_id, sale_id, payment_method_id, amount, tendered_amount,
      reference_number, received_by
    ) values (
      v_business, v_sale.id, v_method.id, v_amount, v_tendered,
      nullif(trim(v_payment->>'reference_number'),''), auth.uid()
    );

    v_paid_total := v_paid_total + v_amount;
    if v_method.payment_kind = 'cash' and v_tendered is not null then
      v_change := v_change + greatest(v_tendered-v_amount,0);
    end if;
  end loop;

  if round(v_paid_total,2) <> round(v_sale.grand_total,2) then
    raise exception 'Payment total (%) must equal bill total (%)', v_paid_total, v_sale.grand_total;
  end if;

  update public.pos_sessions set expected_cash = expected_cash + coalesce((
    select sum(sp.amount)
    from public.pos_sale_payments sp
    join public.pos_payment_methods pm on pm.id = sp.payment_method_id
    where sp.sale_id = v_sale.id and pm.payment_kind = 'cash'
  ),0) where id = v_sale.session_id;

  update public.pos_sales set
    status = 'completed', paid_total = round(v_paid_total,2),
    change_amount = round(v_change,2), completed_at = now()
  where id = v_sale.id;

  return v_sale.id;
end;
$$;

-- cancel_held_pos_sale: pos
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='cancel_held_pos_sale' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='14855fa65dacc5900a6232aad8f01547') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for cancel_held_pos_sale. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.cancel_held_pos_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business_id();
begin
  PERFORM public.require_business_module('pos');

  if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;

  update public.pos_sales set
    status = 'voided', notes = concat_ws(E'\n', notes, 'Cancelled: ' || trim(p_reason))
  where id = p_sale_id and business_id = v_business and status = 'held'
    and (created_by = auth.uid() or public.current_user_role() in ('admin','manager'));

  if not found then raise exception 'Held sale was not found or cannot be cancelled'; end if;
end;
$$;

-- return_pos_sale: pos
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='return_pos_sale' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='8da7093c5a1a7d8ed9f40540bd441dda') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for return_pos_sale. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.return_pos_sale(
  p_sale_id uuid,
  p_lines jsonb,
  p_reason text,
  p_refund_payment_method_id uuid,
  p_refund_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := public.current_business_id();
  v_role public.user_role := public.current_user_role();
  v_sale public.pos_sales%rowtype;
  v_item jsonb;
  v_line public.pos_sale_lines%rowtype;
  v_product public.products%rowtype;
  v_method public.pos_payment_methods%rowtype;
  v_return_id uuid;
  v_return_number text;
  v_qty numeric;
  v_available numeric;
  v_refund numeric;
  v_refund_total numeric := 0;
  v_restock boolean;
begin
  PERFORM public.require_business_module('pos');

  if v_role not in ('admin','manager') then
    raise exception 'Only an admin or manager can process a return';
  end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Return reason is required'; end if;
  if coalesce(jsonb_array_length(p_lines),0) = 0 then raise exception 'Select at least one item'; end if;

  select * into v_sale from public.pos_sales
  where id = p_sale_id and business_id = v_business
    and status in ('completed','partially_refunded')
  for update;
  if not found then raise exception 'Completed sale was not found'; end if;

  select * into v_method from public.pos_payment_methods
  where id = p_refund_payment_method_id and business_id = v_business and active;
  if not found then raise exception 'Invalid refund payment method'; end if;

  v_return_number := 'RET-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.pos_returns (
    business_id, branch_id, original_sale_id, return_number, reason,
    refund_payment_method_id, refund_reference, created_by
  ) values (
    v_business, v_sale.branch_id, v_sale.id, v_return_number, trim(p_reason),
    v_method.id, nullif(trim(p_refund_reference),''), auth.uid()
  ) returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_item->>'quantity')::numeric,0);
    v_restock := coalesce((v_item->>'restock')::boolean,true);

    select * into v_line from public.pos_sale_lines
    where id = (v_item->>'sale_line_id')::uuid
      and sale_id = v_sale.id and business_id = v_business
    for update;
    if not found then raise exception 'Invalid sale line'; end if;

    v_available := v_line.quantity - v_line.returned_quantity;
    if v_qty <= 0 or v_qty > v_available then
      raise exception 'Invalid return quantity for sale line';
    end if;

    select * into v_product from public.products
    where id = v_line.product_id and business_id = v_business;

    v_refund := round(v_line.line_total * v_qty / v_line.quantity,2);
    v_refund_total := v_refund_total + v_refund;

    insert into public.pos_return_lines (
      business_id, return_id, original_sale_line_id, product_id,
      quantity, unit_price, unit_cost, refund_amount, restock
    ) values (
      v_business, v_return_id, v_line.id, v_line.product_id,
      v_qty, v_line.unit_price, v_line.unit_cost, v_refund, v_restock
    );

    update public.pos_sale_lines set returned_quantity = returned_quantity + v_qty
    where id = v_line.id;

    if v_restock and v_product.product_type = 'stockable' then
      insert into public.stock_balances (
        business_id, branch_id, product_id, quantity, average_cost
      ) values (
        v_business, v_sale.branch_id, v_product.id, v_qty, v_line.unit_cost
      ) on conflict (business_id,branch_id,product_id) do update set
        quantity = public.stock_balances.quantity + excluded.quantity,
        updated_at = now();

      insert into public.stock_movements (
        business_id, branch_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, reference_number, created_by
      ) values (
        v_business, v_sale.branch_id, v_product.id, 'sale_return', v_qty,
        v_line.unit_cost, 'pos_return', v_return_id, v_return_number, auth.uid()
      );
    end if;
  end loop;

  update public.pos_returns set refund_total = round(v_refund_total,2)
  where id = v_return_id;

  update public.pos_sales set status = case
    when not exists (
      select 1 from public.pos_sale_lines
      where sale_id = v_sale.id and returned_quantity < quantity
    ) then 'refunded'::public.pos_sale_status
    else 'partially_refunded'::public.pos_sale_status
  end where id = v_sale.id;

  if v_method.payment_kind = 'cash' then
    update public.pos_sessions set expected_cash = expected_cash - v_refund_total
    where id = v_sale.session_id and status = 'open';
  end if;

  return v_return_id;
end;
$$;

-- recalculate_repair_job: repairs
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='recalculate_repair_job' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='d56ba7f5547fa2da0d90a2c7f7bd9b4d') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for recalculate_repair_job. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.recalculate_repair_job(p_job_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_business uuid:=public.current_business_id();
  v_parts numeric:=0;
  v_paid numeric:=0;
begin
  PERFORM public.require_business_module('repairs');

  if not exists(select 1 from public.repair_jobs where id=p_job_id and business_id=v_business) then
    raise exception 'Repair job was not found';
  end if;
  select coalesce(sum(line_total),0) into v_parts from public.repair_job_parts where repair_job_id=p_job_id;
  select coalesce(sum(case when payment_kind='refund' then -amount else amount end),0)
    into v_paid from public.repair_job_payments where repair_job_id=p_job_id;
  update public.repair_jobs set
    parts_total=round(v_parts,2),
    grand_total=greatest(round(service_charge+v_parts-discount_amount+tax_amount,2),0),
    paid_total=greatest(round(v_paid,2),0),
    balance_due=greatest(round(service_charge+v_parts-discount_amount+tax_amount-v_paid,2),0)
  where id=p_job_id and business_id=v_business;
end; $$;

-- create_repair_job: repairs
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_repair_job' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='1dff135275e268742ab3cf04adb520e1') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for create_repair_job. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.create_repair_job(
  p_customer_id uuid, p_branch_id uuid, p_device_type text,
  p_brand text default null, p_model text default null, p_imei_serial text default null,
  p_device_password text default null, p_device_condition text default null,
  p_received_accessories text default null, p_reported_fault text default null,
  p_priority public.repair_priority default 'normal', p_promised_date date default null,
  p_estimated_cost numeric default 0, p_technician_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_business uuid:=public.current_business_id();
  v_id uuid;
  v_number text;
begin
  PERFORM public.require_business_module('repairs');

  if v_business is null then raise exception 'User profile was not found'; end if;
  if trim(coalesce(p_device_type,''))='' then raise exception 'Device type is required'; end if;
  if trim(coalesce(p_reported_fault,''))='' then raise exception 'Reported fault is required'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and business_id=v_business and active) then raise exception 'Invalid customer'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and business_id=v_business and active) then raise exception 'Invalid branch'; end if;
  if p_technician_id is not null and not exists(select 1 from public.profiles where id=p_technician_id and business_id=v_business and active) then raise exception 'Invalid technician'; end if;
  v_number:='REP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
  insert into public.repair_jobs(
    business_id,branch_id,job_number,customer_id,technician_id,priority,device_type,
    brand,model,imei_serial,device_password,device_condition,received_accessories,
    reported_fault,promised_date,estimated_cost,created_by
  ) values (
    v_business,p_branch_id,v_number,p_customer_id,p_technician_id,p_priority,p_device_type,
    nullif(trim(p_brand),''),nullif(trim(p_model),''),nullif(trim(p_imei_serial),''),nullif(trim(p_device_password),''),
    nullif(trim(p_device_condition),''),nullif(trim(p_received_accessories),''),trim(p_reported_fault),
    p_promised_date,greatest(coalesce(p_estimated_cost,0),0),auth.uid()
  ) returning id into v_id;
  insert into public.repair_status_history(business_id,repair_job_id,new_status,note,changed_by)
  values(v_business,v_id,'received','Repair job created',auth.uid());
  return v_id;
end; $$;

-- update_repair_work: repairs
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='update_repair_work' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='c2134697c7c1ea1eb27f67249898f1d8') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for update_repair_work. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.update_repair_work(
  p_job_id uuid, p_technician_id uuid default null, p_diagnosis text default null,
  p_work_done text default null, p_internal_notes text default null,
  p_service_charge numeric default 0, p_discount_amount numeric default 0,
  p_tax_amount numeric default 0, p_customer_approved boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); begin
  PERFORM public.require_business_module('repairs');

  update public.repair_jobs set
    technician_id=p_technician_id, diagnosis=nullif(trim(p_diagnosis),''),
    work_done=nullif(trim(p_work_done),''), internal_notes=nullif(trim(p_internal_notes),''),
    service_charge=greatest(coalesce(p_service_charge,0),0),
    discount_amount=greatest(coalesce(p_discount_amount,0),0),
    tax_amount=greatest(coalesce(p_tax_amount,0),0),
    customer_approved_at=case when p_customer_approved then coalesce(customer_approved_at,now()) else null end
  where id=p_job_id and business_id=v_business;
  if not found then raise exception 'Repair job was not found'; end if;
  perform public.recalculate_repair_job(p_job_id);
end; $$;

-- change_repair_status: repairs
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='change_repair_status' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='5a883ad946d213bf442d43684b7bc1cb') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for change_repair_status. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.change_repair_status(
  p_job_id uuid, p_new_status public.repair_status, p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_old public.repair_status; begin
  PERFORM public.require_business_module('repairs');

  select status into v_old from public.repair_jobs where id=p_job_id and business_id=v_business for update;
  if v_old is null then raise exception 'Repair job was not found'; end if;
  if v_old in ('delivered','cancelled') then raise exception 'A closed job cannot be changed'; end if;
  if p_new_status='delivered' and exists(select 1 from public.repair_jobs where id=p_job_id and balance_due>0) then
    raise exception 'Settle the outstanding balance before delivery';
  end if;
  update public.repair_jobs set status=p_new_status,
    completed_at=case when p_new_status='ready' then now() else completed_at end,
    delivered_at=case when p_new_status='delivered' then now() else delivered_at end,
    cancelled_at=case when p_new_status='cancelled' then now() else cancelled_at end,
    cancellation_reason=case when p_new_status='cancelled' then nullif(trim(p_note),'') else cancellation_reason end
  where id=p_job_id;
  insert into public.repair_status_history(business_id,repair_job_id,old_status,new_status,note,changed_by)
  values(v_business,p_job_id,v_old,p_new_status,nullif(trim(p_note),''),auth.uid());
end; $$;

-- add_repair_part: repairs
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='add_repair_part' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='0012e79dd8d5e4ff384e0f24877be31c') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for add_repair_part. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.add_repair_part(
  p_job_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_business uuid:=public.current_business_id(); v_job public.repair_jobs%rowtype;
  v_product public.products%rowtype; v_stock numeric:=0; v_id uuid; v_price numeric;
begin
  PERFORM public.require_business_module('repairs');

  select * into v_job from public.repair_jobs where id=p_job_id and business_id=v_business for update;
  if not found then raise exception 'Repair job was not found'; end if;
  if v_job.status in ('delivered','cancelled') then raise exception 'Cannot add parts to a closed job'; end if;
  select * into v_product from public.products where id=p_product_id and business_id=v_business and active and product_type='stockable';
  if not found then raise exception 'Select an active stock product'; end if;
  if coalesce(p_quantity,0)<=0 then raise exception 'Quantity must be greater than zero'; end if;
  select coalesce(quantity,0) into v_stock from public.stock_balances
    where business_id=v_business and branch_id=v_job.branch_id and product_id=p_product_id for update;
  if coalesce(v_stock,0)<p_quantity then raise exception 'Insufficient stock for %. Available: %',v_product.name,coalesce(v_stock,0); end if;
  v_price:=coalesce(p_unit_price,v_product.selling_price);
  insert into public.repair_job_parts(business_id,repair_job_id,product_id,quantity,unit_cost,unit_price,line_total,created_by)
  values(v_business,p_job_id,p_product_id,p_quantity,v_product.cost_price,v_price,round(p_quantity*v_price,2),auth.uid()) returning id into v_id;
  update public.stock_balances set quantity=quantity-p_quantity,updated_at=now()
    where business_id=v_business and branch_id=v_job.branch_id and product_id=p_product_id;
  insert into public.stock_movements(business_id,branch_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,reference_number,created_by)
  values(v_business,v_job.branch_id,p_product_id,'adjustment_out',-p_quantity,v_product.cost_price,'repair_job',p_job_id,v_job.job_number,auth.uid());
  perform public.recalculate_repair_job(p_job_id);
  return v_id;
end; $$;

-- add_repair_payment: repairs
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='add_repair_payment' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='bb824a751cc60a6667df9c6eb8b0043a') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for add_repair_payment. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.add_repair_payment(
  p_job_id uuid, p_payment_method_id uuid, p_amount numeric,
  p_payment_kind public.repair_payment_kind default 'payment',
  p_reference_number text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_id uuid; begin
  PERFORM public.require_business_module('repairs');

  if coalesce(p_amount,0)<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  if not exists(select 1 from public.repair_jobs where id=p_job_id and business_id=v_business) then raise exception 'Repair job was not found'; end if;
  if not exists(select 1 from public.pos_payment_methods where id=p_payment_method_id and business_id=v_business and active) then raise exception 'Invalid payment method'; end if;
  insert into public.repair_job_payments(business_id,repair_job_id,payment_kind,payment_method_id,amount,reference_number,notes,received_by)
  values(v_business,p_job_id,p_payment_kind,p_payment_method_id,p_amount,nullif(trim(p_reference_number),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  perform public.recalculate_repair_job(p_job_id);
  return v_id;
end; $$;

-- create_expense: expenses
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_expense' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='09e9eff864a434d64a824255ca119063') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for create_expense. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.create_expense(
  p_branch_id uuid,p_category_id uuid,p_expense_date date,p_payee text,
  p_description text,p_amount numeric,p_tax_amount numeric default 0,
  p_notes text default null,p_attachment_url text default null,p_submit boolean default true
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_id uuid;v_number text;v_status public.expense_status;
begin
  PERFORM public.require_business_module('expenses');

  if v_business is null then raise exception 'User profile was not found'; end if;
  if trim(coalesce(p_payee,''))='' then raise exception 'Payee is required'; end if;
  if trim(coalesce(p_description,''))='' then raise exception 'Description is required'; end if;
  if coalesce(p_amount,0)<=0 or coalesce(p_tax_amount,0)<0 then raise exception 'Enter valid amounts'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and business_id=v_business and active) then raise exception 'Invalid branch'; end if;
  if not exists(select 1 from public.expense_categories where id=p_category_id and business_id=v_business and active) then raise exception 'Invalid expense category'; end if;
  v_number:='EXP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');v_status:=case when p_submit then 'submitted' else 'draft' end;
  insert into public.expenses(business_id,branch_id,category_id,expense_number,expense_date,payee,description,amount,tax_amount,total_amount,status,notes,attachment_url,submitted_at,created_by)
  values(v_business,p_branch_id,p_category_id,v_number,coalesce(p_expense_date,current_date),trim(p_payee),trim(p_description),round(p_amount,2),round(coalesce(p_tax_amount,0),2),round(p_amount+coalesce(p_tax_amount,0),2),v_status,nullif(trim(p_notes),''),nullif(trim(p_attachment_url),''),case when p_submit then now() end,auth.uid()) returning id into v_id;
  insert into public.expense_status_history(business_id,expense_id,new_status,note,changed_by) values(v_business,v_id,v_status,'Expense created',auth.uid());
  return v_id;
end;$$;

-- change_expense_status: expenses
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='change_expense_status' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='a8de8c4e1a475e781e1063339588e351') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for change_expense_status. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.change_expense_status(p_expense_id uuid,p_new_status public.expense_status,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_old public.expense_status;v_role text:=public.current_user_role();
begin
  PERFORM public.require_business_module('expenses');

 select status into v_old from public.expenses where id=p_expense_id and business_id=v_business for update;
 if v_old is null then raise exception 'Expense was not found'; end if;
 if v_old in ('paid','voided') then raise exception 'This expense is already closed'; end if;
 if p_new_status in ('approved','rejected','voided') and v_role not in ('admin','manager') then raise exception 'Manager approval is required'; end if;
 if p_new_status='approved' and v_old<>'submitted' then raise exception 'Only submitted expenses can be approved'; end if;
 if p_new_status='rejected' and trim(coalesce(p_note,''))='' then raise exception 'Enter a rejection reason'; end if;
 update public.expenses set status=p_new_status,
  submitted_at=case when p_new_status='submitted' then now() else submitted_at end,
  approved_by=case when p_new_status='approved' then auth.uid() else approved_by end,
  approved_at=case when p_new_status='approved' then now() else approved_at end,
  rejection_reason=case when p_new_status='rejected' then trim(p_note) else rejection_reason end,
  void_reason=case when p_new_status='voided' then nullif(trim(p_note),'') else void_reason end
 where id=p_expense_id;
 insert into public.expense_status_history(business_id,expense_id,old_status,new_status,note,changed_by) values(v_business,p_expense_id,v_old,p_new_status,nullif(trim(p_note),''),auth.uid());
end;$$;

-- pay_expense: expenses
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='pay_expense' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='66f8af3ed9ff497807d89253c382bf0c') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for pay_expense. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.pay_expense(p_expense_id uuid,p_payment_method_id uuid,p_reference text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_old public.expense_status;
begin
  PERFORM public.require_business_module('expenses');

 select status into v_old from public.expenses where id=p_expense_id and business_id=v_business for update;
 if v_old is null then raise exception 'Expense was not found'; end if;
 if v_old<>'approved' then raise exception 'Approve the expense before payment'; end if;
 if not exists(select 1 from public.pos_payment_methods where id=p_payment_method_id and business_id=v_business and active) then raise exception 'Invalid payment method'; end if;
 update public.expenses set status='paid',payment_method_id=p_payment_method_id,payment_reference=nullif(trim(p_reference),''),paid_by=auth.uid(),paid_at=now() where id=p_expense_id;
 insert into public.expense_status_history(business_id,expense_id,old_status,new_status,note,changed_by) values(v_business,p_expense_id,v_old,'paid','Expense paid',auth.uid());
end;$$;

-- record_customer_receipt: accounting
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='record_customer_receipt' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='613bd2525e1c923ae42ac93b04bf0297') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for record_customer_receipt. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.record_customer_receipt(p_branch_id uuid,p_customer_id uuid,p_amount numeric,p_payment_method_id uuid,p_reference text default null,p_notes text default null,p_receipt_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_id uuid;v_number text;
begin
  PERFORM public.require_business_module('accounting');

 if coalesce(p_amount,0)<=0 then raise exception 'Amount must be greater than zero'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id and business_id=v_business and active) then raise exception 'Invalid customer'; end if;
 if not exists(select 1 from public.branches where id=p_branch_id and business_id=v_business and active) then raise exception 'Invalid branch'; end if;
 if not exists(select 1 from public.pos_payment_methods where id=p_payment_method_id and business_id=v_business and active) then raise exception 'Invalid payment method'; end if;
 v_number:='CR-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into public.customer_receipts(business_id,branch_id,customer_id,receipt_number,receipt_date,amount,payment_method_id,reference_number,notes,received_by)
 values(v_business,p_branch_id,p_customer_id,v_number,coalesce(p_receipt_date,current_date),round(p_amount,2),p_payment_method_id,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 insert into public.cashbook_transactions(business_id,branch_id,transaction_date,direction,payment_method_id,amount,source_type,source_id,reference_number,description,created_by)
 values(v_business,p_branch_id,coalesce(p_receipt_date,current_date),'in',p_payment_method_id,round(p_amount,2),'customer_receipt',v_id,v_number,'Customer receipt '||v_number,auth.uid());
 return v_id;
end;$$;

-- create_supplier_bill: accounting
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='create_supplier_bill' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='c0ce9a35bdcd96a3adcab61c67028d60') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for create_supplier_bill. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.create_supplier_bill(p_purchase_order_id uuid,p_supplier_invoice text default null,p_bill_date date default current_date,p_due_date date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_po public.purchase_orders%rowtype;v_id uuid;v_number text;v_terms int;
begin
  PERFORM public.require_business_module('accounting');

 select * into v_po from public.purchase_orders where id=p_purchase_order_id and business_id=v_business and status in('partially_received','received');
 if not found then raise exception 'Select a received purchase order'; end if;
 if v_po.branch_id is null then raise exception 'The purchase order does not have a branch'; end if;
 select payment_terms_days into v_terms from public.suppliers where id=v_po.supplier_id;
 v_number:='BILL-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into public.supplier_bills(business_id,branch_id,supplier_id,purchase_order_id,bill_number,supplier_invoice_number,bill_date,due_date,total_amount,balance_due,notes,created_by)
 values(v_business,v_po.branch_id,v_po.supplier_id,v_po.id,v_number,nullif(trim(p_supplier_invoice),''),coalesce(p_bill_date,current_date),coalesce(p_due_date,coalesce(p_bill_date,current_date)+v_terms),v_po.grand_total,v_po.grand_total,nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 return v_id;
end;$$;

-- record_supplier_payment: accounting
DO $check$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='record_supplier_payment' AND md5(replace(p.prosrc, E'\r\n', E'\n'))='2ae26ced4a5c00f74f7ff8e7ea66d611') <> 1 THEN
    RAISE EXCEPTION 'Unexpected live definition for record_supplier_payment. Migration stopped; no changes committed.';
  END IF;
END;
$check$;
create or replace function public.record_supplier_payment(p_supplier_bill_id uuid,p_amount numeric,p_payment_method_id uuid,p_reference text default null,p_notes text default null,p_payment_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_bill public.supplier_bills%rowtype;v_id uuid;v_number text;v_new_paid numeric;
begin
  PERFORM public.require_business_module('accounting');

 select * into v_bill from public.supplier_bills where id=p_supplier_bill_id and business_id=v_business for update;
 if not found or v_bill.status='voided' then raise exception 'Supplier bill was not found'; end if;
 if coalesce(p_amount,0)<=0 or p_amount>v_bill.balance_due then raise exception 'Payment must be between 0 and %',v_bill.balance_due; end if;
 if not exists(select 1 from public.pos_payment_methods where id=p_payment_method_id and business_id=v_business and active) then raise exception 'Invalid payment method'; end if;
 v_number:='SP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');v_new_paid:=v_bill.paid_amount+p_amount;
 insert into public.supplier_payments(business_id,supplier_bill_id,payment_number,payment_date,amount,payment_method_id,reference_number,notes,paid_by)
 values(v_business,v_bill.id,v_number,coalesce(p_payment_date,current_date),round(p_amount,2),p_payment_method_id,nullif(trim(p_reference),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 update public.supplier_bills set paid_amount=round(v_new_paid,2),balance_due=round(total_amount-v_new_paid,2),status=case when round(total_amount-v_new_paid,2)=0 then 'paid'::public.supplier_bill_status else 'partially_paid'::public.supplier_bill_status end where id=v_bill.id;
 insert into public.cashbook_transactions(business_id,branch_id,transaction_date,direction,payment_method_id,amount,source_type,source_id,reference_number,description,created_by)
 values(v_business,v_bill.branch_id,coalesce(p_payment_date,current_date),'out',p_payment_method_id,round(p_amount,2),'supplier_payment',v_id,v_number,'Supplier payment '||v_number,auth.uid());
 return v_id;
end;$$;

COMMIT;
