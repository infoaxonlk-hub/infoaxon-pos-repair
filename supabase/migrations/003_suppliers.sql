begin;

create type public.supplier_type as enum ('individual', 'business');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  supplier_type public.supplier_type not null default 'business',
  name text not null,
  company_name text,
  phone text not null,
  alternate_phone text,
  email text,
  nic_or_registration text,
  tax_number text,
  address text,
  city text,
  bank_name text,
  bank_branch text,
  account_name text,
  account_number text,
  payment_terms_days integer not null default 0,
  opening_balance numeric(14, 2) not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_business_code_unique unique (business_id, code),
  constraint suppliers_id_business_unique unique (id, business_id),
  constraint suppliers_payment_terms_non_negative check (payment_terms_days >= 0),
  constraint suppliers_opening_balance_non_negative check (opening_balance >= 0)
);

create index suppliers_business_id_idx on public.suppliers (business_id);
create index suppliers_name_idx on public.suppliers (business_id, name);
create index suppliers_type_idx on public.suppliers (business_id, supplier_type);
create index suppliers_active_idx on public.suppliers (business_id, active);

create trigger suppliers_set_updated_at before update on public.suppliers
for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

create policy suppliers_select_own_business on public.suppliers for select to authenticated
using (business_id = public.current_business_id());

create policy suppliers_insert_authorized on public.suppliers for insert to authenticated
with check (business_id = public.current_business_id() and public.current_user_role() in ('admin', 'manager'));

create policy suppliers_update_authorized on public.suppliers for update to authenticated
using (business_id = public.current_business_id() and public.current_user_role() in ('admin', 'manager'))
with check (business_id = public.current_business_id() and public.current_user_role() in ('admin', 'manager'));

create policy suppliers_delete_authorized on public.suppliers for delete to authenticated
using (business_id = public.current_business_id() and public.current_user_role() in ('admin', 'manager'));

grant select, insert, update, delete on public.suppliers to authenticated;
commit;
