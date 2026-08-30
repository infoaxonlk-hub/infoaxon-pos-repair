begin;

create type public.customer_type as enum ('individual', 'business');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  customer_type public.customer_type not null default 'individual',
  name text not null,
  company_name text,
  phone text not null,
  alternate_phone text,
  email text,
  nic text,
  tax_number text,
  address text,
  city text,
  credit_limit numeric(14, 2) not null default 0,
  opening_balance numeric(14, 2) not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint customers_business_code_unique unique (business_id, code),
  constraint customers_id_business_unique unique (id, business_id),
  constraint customers_credit_limit_non_negative check (credit_limit >= 0)
);

create unique index customers_business_phone_unique
  on public.customers (business_id, phone)
  where phone <> '';

create index customers_business_id_idx on public.customers (business_id);
create index customers_name_idx on public.customers (business_id, name);
create index customers_type_idx on public.customers (business_id, customer_type);
create index customers_active_idx on public.customers (business_id, active);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy customers_select_own_business
on public.customers for select to authenticated
using (business_id = public.current_business_id());

create policy customers_insert_own_business
on public.customers for insert to authenticated
with check (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager', 'cashier', 'technician')
);

create policy customers_update_own_business
on public.customers for update to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager', 'cashier', 'technician')
)
with check (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager', 'cashier', 'technician')
);

create policy customers_delete_authorized
on public.customers for delete to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager')
);

grant select, insert, update, delete on public.customers to authenticated;

commit;
