begin;

create type public.pos_session_status as enum ('open', 'closed');
create type public.pos_sale_status as enum (
  'held',
  'completed',
  'voided',
  'partially_refunded',
  'refunded'
);
create type public.pos_payment_kind as enum (
  'cash',
  'card',
  'bank_transfer',
  'credit',
  'other'
);

create table public.pos_payment_methods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  payment_kind public.pos_payment_kind not null default 'cash',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_payment_methods_business_name_unique unique (business_id, name),
  constraint pos_payment_methods_id_business_unique unique (id, business_id)
);

create table public.pos_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  cashier_id uuid not null references public.profiles(id) on delete restrict,
  status public.pos_session_status not null default 'open',
  opening_balance numeric(14,2) not null default 0,
  expected_cash numeric(14,2) not null default 0,
  closing_cash numeric(14,2),
  cash_difference numeric(14,2),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text,
  constraint pos_sessions_branch_business_fk
    foreign key (branch_id, business_id)
    references public.branches(id, business_id) on delete restrict,
  constraint pos_sessions_opening_balance_non_negative check (opening_balance >= 0),
  constraint pos_sessions_close_values_check check (
    (status = 'open' and closed_at is null)
    or (status = 'closed' and closed_at is not null and closing_cash is not null)
  )
);

create unique index pos_one_open_session_per_cashier
  on public.pos_sessions (business_id, cashier_id)
  where status = 'open';

create table public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  session_id uuid references public.pos_sessions(id) on delete restrict,
  customer_id uuid,
  sale_number text not null,
  status public.pos_sale_status not null default 'completed',
  sale_date timestamptz not null default now(),
  subtotal numeric(14,2) not null default 0,
  line_discount_total numeric(14,2) not null default 0,
  bill_discount numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  change_amount numeric(14,2) not null default 0,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_sales_business_number_unique unique (business_id, sale_number),
  constraint pos_sales_id_business_unique unique (id, business_id),
  constraint pos_sales_branch_business_fk
    foreign key (branch_id, business_id)
    references public.branches(id, business_id) on delete restrict,
  constraint pos_sales_customer_business_fk
    foreign key (customer_id, business_id)
    references public.customers(id, business_id) on delete restrict,
  constraint pos_sales_amounts_non_negative check (
    subtotal >= 0 and line_discount_total >= 0 and bill_discount >= 0
    and tax_total >= 0 and grand_total >= 0 and paid_total >= 0
    and change_amount >= 0
  )
);

create table public.pos_sale_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null,
  product_id uuid not null,
  description text,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null,
  returned_quantity numeric(14,3) not null default 0,
  constraint pos_sale_lines_sale_fk
    foreign key (sale_id, business_id)
    references public.pos_sales(id, business_id) on delete cascade,
  constraint pos_sale_lines_product_fk
    foreign key (product_id, business_id)
    references public.products(id, business_id) on delete restrict,
  constraint pos_sale_lines_values_check check (
    quantity > 0 and unit_price >= 0 and unit_cost >= 0
    and discount_percent between 0 and 100
    and tax_percent between 0 and 100
    and discount_amount >= 0 and tax_amount >= 0 and line_total >= 0
    and returned_quantity >= 0 and returned_quantity <= quantity
  )
);

create table public.pos_sale_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null,
  payment_method_id uuid not null,
  amount numeric(14,2) not null,
  tendered_amount numeric(14,2),
  reference_number text,
  paid_at timestamptz not null default now(),
  received_by uuid not null references public.profiles(id) on delete restrict,
  constraint pos_sale_payments_sale_fk
    foreign key (sale_id, business_id)
    references public.pos_sales(id, business_id) on delete cascade,
  constraint pos_sale_payments_method_fk
    foreign key (payment_method_id, business_id)
    references public.pos_payment_methods(id, business_id) on delete restrict,
  constraint pos_sale_payments_amount_positive check (amount > 0),
  constraint pos_sale_payments_tendered_check check (
    tendered_amount is null or tendered_amount >= amount
  )
);

create index pos_sessions_business_status_idx
  on public.pos_sessions (business_id, status, opened_at desc);
create index pos_sales_business_date_idx
  on public.pos_sales (business_id, sale_date desc);
create index pos_sales_customer_idx
  on public.pos_sales (business_id, customer_id);
create index pos_sales_status_idx
  on public.pos_sales (business_id, status);
create index pos_sale_lines_sale_idx on public.pos_sale_lines (sale_id);
create index pos_sale_payments_sale_idx on public.pos_sale_payments (sale_id);

create trigger pos_payment_methods_set_updated_at
before update on public.pos_payment_methods
for each row execute function public.set_updated_at();

create trigger pos_sales_set_updated_at
before update on public.pos_sales
for each row execute function public.set_updated_at();

alter table public.pos_payment_methods enable row level security;
alter table public.pos_sessions enable row level security;
alter table public.pos_sales enable row level security;
alter table public.pos_sale_lines enable row level security;
alter table public.pos_sale_payments enable row level security;

create policy pos_payment_methods_select on public.pos_payment_methods
for select to authenticated
using (business_id = public.current_business_id());

create policy pos_payment_methods_manage on public.pos_payment_methods
for all to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin','manager')
)
with check (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin','manager')
);

create policy pos_sessions_select on public.pos_sessions
for select to authenticated
using (business_id = public.current_business_id());

create policy pos_sales_select on public.pos_sales
for select to authenticated
using (business_id = public.current_business_id());

create policy pos_sale_lines_select on public.pos_sale_lines
for select to authenticated
using (business_id = public.current_business_id());

create policy pos_sale_payments_select on public.pos_sale_payments
for select to authenticated
using (business_id = public.current_business_id());

grant select, insert, update, delete on public.pos_payment_methods to authenticated;
grant select on public.pos_sessions, public.pos_sales,
  public.pos_sale_lines, public.pos_sale_payments to authenticated;

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

revoke all on function public.open_pos_session(numeric,text) from public;
revoke all on function public.create_pos_sale(uuid,uuid,jsonb,jsonb,numeric,text,boolean) from public;
revoke all on function public.close_pos_session(uuid,numeric,text) from public;

grant execute on function public.open_pos_session(numeric,text) to authenticated;
grant execute on function public.create_pos_sale(uuid,uuid,jsonb,jsonb,numeric,text,boolean) to authenticated;
grant execute on function public.close_pos_session(uuid,numeric,text) to authenticated;

insert into public.pos_payment_methods (business_id, name, payment_kind)
select b.id, methods.name, methods.kind::public.pos_payment_kind
from public.businesses b
cross join (values
  ('Cash','cash'),
  ('Card','card'),
  ('Bank Transfer','bank_transfer'),
  ('Credit','credit')
) as methods(name,kind)
on conflict (business_id,name) do nothing;

commit;
