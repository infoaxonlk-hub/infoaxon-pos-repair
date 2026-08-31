begin;

create table public.pos_returns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  original_sale_id uuid not null,
  return_number text not null,
  return_date timestamptz not null default now(),
  reason text not null,
  refund_total numeric(14,2) not null default 0,
  refund_payment_method_id uuid,
  refund_reference text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint pos_returns_business_number_unique unique (business_id, return_number),
  constraint pos_returns_id_business_unique unique (id, business_id),
  constraint pos_returns_branch_business_fk
    foreign key (branch_id, business_id)
    references public.branches(id, business_id) on delete restrict,
  constraint pos_returns_sale_business_fk
    foreign key (original_sale_id, business_id)
    references public.pos_sales(id, business_id) on delete restrict,
  constraint pos_returns_payment_method_business_fk
    foreign key (refund_payment_method_id, business_id)
    references public.pos_payment_methods(id, business_id) on delete restrict,
  constraint pos_returns_total_non_negative check (refund_total >= 0)
);

create table public.pos_return_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  return_id uuid not null,
  original_sale_line_id uuid not null references public.pos_sale_lines(id) on delete restrict,
  product_id uuid not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null,
  restock boolean not null default true,
  constraint pos_return_lines_return_business_fk
    foreign key (return_id, business_id)
    references public.pos_returns(id, business_id) on delete cascade,
  constraint pos_return_lines_product_business_fk
    foreign key (product_id, business_id)
    references public.products(id, business_id) on delete restrict,
  constraint pos_return_lines_values_check check (
    quantity > 0 and unit_price >= 0 and unit_cost >= 0 and refund_amount >= 0
  )
);

create index pos_returns_business_date_idx
  on public.pos_returns (business_id, return_date desc);
create index pos_returns_sale_idx on public.pos_returns (original_sale_id);
create index pos_return_lines_return_idx on public.pos_return_lines (return_id);

alter table public.pos_returns enable row level security;
alter table public.pos_return_lines enable row level security;

create policy pos_returns_select on public.pos_returns
for select to authenticated
using (business_id = public.current_business_id());

create policy pos_return_lines_select on public.pos_return_lines
for select to authenticated
using (business_id = public.current_business_id());

grant select on public.pos_returns, public.pos_return_lines to authenticated;

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
  if nullif(trim(p_reason),'') is null then raise exception 'Cancellation reason is required'; end if;

  update public.pos_sales set
    status = 'voided', notes = concat_ws(E'\n', notes, 'Cancelled: ' || trim(p_reason))
  where id = p_sale_id and business_id = v_business and status = 'held'
    and (created_by = auth.uid() or public.current_user_role() in ('admin','manager'));

  if not found then raise exception 'Held sale was not found or cannot be cancelled'; end if;
end;
$$;

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

revoke all on function public.complete_held_pos_sale(uuid,jsonb) from public;
revoke all on function public.cancel_held_pos_sale(uuid,text) from public;
revoke all on function public.return_pos_sale(uuid,jsonb,text,uuid,text) from public;

grant execute on function public.complete_held_pos_sale(uuid,jsonb) to authenticated;
grant execute on function public.cancel_held_pos_sale(uuid,text) to authenticated;
grant execute on function public.return_pos_sale(uuid,jsonb,text,uuid,text) to authenticated;

commit;
