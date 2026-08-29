begin;

-- Required extension for UUID generation
create extension if not exists pgcrypto;

-- User roles available inside the system
create type public.user_role as enum (
  'admin',
  'manager',
  'cashier',
  'technician'
);

-- Product types
create type public.product_type as enum (
  'stockable',
  'service'
);

-- Businesses using the system
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  phone text,
  email text,
  address text,
  currency_code text not null default 'LKR',
  timezone text not null default 'Asia/Colombo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Business branches
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null
    references public.businesses(id) on delete cascade,
  name text not null,
  code text not null,
  phone text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branches_business_code_unique
    unique (business_id, code),

  constraint branches_id_business_unique
    unique (id, business_id)
);

-- Application user profiles linked to Supabase Auth
create table public.profiles (
  id uuid primary key
    references auth.users(id) on delete cascade,
  business_id uuid not null
    references public.businesses(id) on delete cascade,
  branch_id uuid,
  full_name text not null,
  role public.user_role not null default 'cashier',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_branch_business_fk
    foreign key (branch_id, business_id)
    references public.branches(id, business_id)
    on delete restrict
);

-- Product categories
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null
    references public.businesses(id) on delete cascade,
  parent_id uuid,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_categories_business_name_unique
    unique (business_id, name),

  constraint product_categories_id_business_unique
    unique (id, business_id),

  constraint product_categories_parent_fk
    foreign key (parent_id, business_id)
    references public.product_categories(id, business_id)
    on delete restrict
);

-- Products and repair service items
create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null
    references public.businesses(id) on delete cascade,
  category_id uuid,
  name text not null,
  sku text not null,
  barcode text,
  product_type public.product_type not null default 'stockable',
  brand text,
  model text,
  unit_name text not null default 'Unit',
  cost_price numeric(14, 2) not null default 0,
  selling_price numeric(14, 2) not null default 0,
  minimum_stock numeric(14, 3) not null default 0,
  track_serial_number boolean not null default false,
  allow_price_change boolean not null default false,
  image_url text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_business_sku_unique
    unique (business_id, sku),

  constraint products_id_business_unique
    unique (id, business_id),

  constraint products_category_business_fk
    foreign key (category_id, business_id)
    references public.product_categories(id, business_id)
    on delete restrict,

  constraint products_cost_price_non_negative
    check (cost_price >= 0),

  constraint products_selling_price_non_negative
    check (selling_price >= 0),

  constraint products_minimum_stock_non_negative
    check (minimum_stock >= 0)
);

-- Barcode must be unique inside one business when provided
create unique index products_business_barcode_unique
  on public.products (business_id, barcode)
  where barcode is not null and barcode <> '';

-- Performance indexes
create index branches_business_id_idx
  on public.branches (business_id);

create index profiles_business_id_idx
  on public.profiles (business_id);

create index profiles_branch_id_idx
  on public.profiles (branch_id);

create index product_categories_business_id_idx
  on public.product_categories (business_id);

create index products_business_id_idx
  on public.products (business_id);

create index products_category_id_idx
  on public.products (category_id);

create index products_name_idx
  on public.products (business_id, name);

-- Automatically update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger product_categories_set_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- Return the logged-in user's business
create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

-- Return the logged-in user's role
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_business_id() from public;
revoke all on function public.current_user_role() from public;

grant execute on function public.current_business_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;

-- Enable Row Level Security
alter table public.businesses enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;

-- Business security
create policy businesses_select_own
on public.businesses
for select
to authenticated
using (id = public.current_business_id());

create policy businesses_update_admin
on public.businesses
for update
to authenticated
using (
  id = public.current_business_id()
  and public.current_user_role() = 'admin'
)
with check (
  id = public.current_business_id()
  and public.current_user_role() = 'admin'
);

-- Branch security
create policy branches_select_own_business
on public.branches
for select
to authenticated
using (business_id = public.current_business_id());

create policy branches_manage_admin
on public.branches
for all
to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() = 'admin'
)
with check (
  business_id = public.current_business_id()
  and public.current_user_role() = 'admin'
);

-- Profile security
create policy profiles_select_own_business
on public.profiles
for select
to authenticated
using (business_id = public.current_business_id());

create policy profiles_manage_admin
on public.profiles
for all
to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() = 'admin'
)
with check (
  business_id = public.current_business_id()
  and public.current_user_role() = 'admin'
);

-- Product category security
create policy product_categories_select_own_business
on public.product_categories
for select
to authenticated
using (business_id = public.current_business_id());

create policy product_categories_manage_authorized
on public.product_categories
for all
to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager')
)
with check (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager')
);

-- Product security
create policy products_select_own_business
on public.products
for select
to authenticated
using (business_id = public.current_business_id());

create policy products_manage_authorized
on public.products
for all
to authenticated
using (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager')
)
with check (
  business_id = public.current_business_id()
  and public.current_user_role() in ('admin', 'manager')
);

-- Allow authenticated application users to access the tables.
-- Row Level Security policies still control which records they can access.
grant usage on schema public to authenticated;

grant select, insert, update, delete
on public.businesses,
   public.branches,
   public.profiles,
   public.product_categories,
   public.products
to authenticated;

commit;