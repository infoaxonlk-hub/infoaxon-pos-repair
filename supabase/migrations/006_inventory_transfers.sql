begin;

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

revoke all on function public.transfer_inventory(
  uuid,
  uuid,
  uuid,
  numeric,
  text
) from public;

grant execute on function public.transfer_inventory(
  uuid,
  uuid,
  uuid,
  numeric,
  text
) to authenticated;

commit;
