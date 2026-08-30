begin;

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

revoke all on function public.adjust_inventory(
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  text
) from public;

grant execute on function public.adjust_inventory(
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  text
) to authenticated;

commit;
