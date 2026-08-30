begin;

create type public.purchase_status as enum ('draft','confirmed','partially_received','received','cancelled');

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  order_number text not null,
  order_date date not null default current_date,
  expected_date date,
  supplier_reference text,
  status public.purchase_status not null default 'draft',
  notes text,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_business_number_unique unique (business_id, order_number),
  constraint purchase_orders_id_business_unique unique (id,business_id),
  constraint purchase_orders_amounts_non_negative check (subtotal>=0 and discount_total>=0 and tax_total>=0 and grand_total>=0)
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id uuid not null,
  product_id uuid not null,
  description text,
  ordered_qty numeric(14,3) not null,
  received_qty numeric(14,3) not null default 0,
  unit_cost numeric(14,2) not null,
  discount_percent numeric(5,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  line_total numeric(14,2) not null,
  constraint po_lines_order_fk foreign key (purchase_order_id,business_id) references public.purchase_orders(id,business_id) on delete cascade,
  constraint po_lines_product_fk foreign key (product_id,business_id) references public.products(id,business_id) on delete restrict,
  constraint po_lines_qty_cost_check check (ordered_qty>0 and received_qty>=0 and received_qty<=ordered_qty and unit_cost>=0),
  constraint po_lines_rates_check check (discount_percent between 0 and 100 and tax_percent between 0 and 100)
);

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_order_id uuid not null,
  receipt_number text not null,
  receipt_date date not null default current_date,
  supplier_document text,
  notes text,
  received_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint goods_receipts_business_number_unique unique (business_id,receipt_number),
  constraint goods_receipts_id_business_unique unique (id,business_id),
  constraint goods_receipts_order_fk foreign key (purchase_order_id,business_id) references public.purchase_orders(id,business_id) on delete restrict
);

create table public.goods_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  goods_receipt_id uuid not null,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  product_id uuid not null,
  received_qty numeric(14,3) not null check (received_qty>0),
  unit_cost numeric(14,2) not null check (unit_cost>=0),
  constraint gr_lines_receipt_fk foreign key (goods_receipt_id,business_id) references public.goods_receipts(id,business_id) on delete cascade,
  constraint gr_lines_product_fk foreign key (product_id,business_id) references public.products(id,business_id) on delete restrict
);

create table public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid,
  product_id uuid not null,
  quantity numeric(14,3) not null default 0,
  average_cost numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint stock_balance_unique unique nulls not distinct (business_id,branch_id,product_id),
  constraint stock_balance_product_fk foreign key (product_id,business_id) references public.products(id,business_id) on delete restrict,
  constraint stock_balance_branch_fk foreign key (branch_id,business_id) references public.branches(id,business_id) on delete restrict
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('purchase_receipt','purchase_return','sale','sale_return','adjustment_in','adjustment_out','transfer_in','transfer_out')),
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  reference_type text,
  reference_id uuid,
  reference_number text,
  movement_date date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint stock_movements_product_fk foreign key (product_id,business_id) references public.products(id,business_id) on delete restrict,
  constraint stock_movements_branch_fk foreign key (branch_id,business_id) references public.branches(id,business_id) on delete restrict,
  constraint stock_movements_quantity_nonzero check (quantity<>0)
);

create index po_business_status_idx on public.purchase_orders(business_id,status);
create index po_supplier_idx on public.purchase_orders(business_id,supplier_id);
create index po_lines_order_idx on public.purchase_order_lines(purchase_order_id);
create index gr_order_idx on public.goods_receipts(purchase_order_id);
create index stock_balances_product_idx on public.stock_balances(business_id,product_id);
create index stock_movements_product_date_idx on public.stock_movements(business_id,product_id,movement_date);

create trigger purchase_orders_set_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_lines enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;

create policy po_select on public.purchase_orders for select to authenticated using (business_id=public.current_business_id());
create policy po_manage on public.purchase_orders for all to authenticated using (business_id=public.current_business_id() and public.current_user_role() in ('admin','manager')) with check (business_id=public.current_business_id() and public.current_user_role() in ('admin','manager'));
create policy po_lines_select on public.purchase_order_lines for select to authenticated using (business_id=public.current_business_id());
create policy po_lines_manage on public.purchase_order_lines for all to authenticated using (business_id=public.current_business_id() and public.current_user_role() in ('admin','manager')) with check (business_id=public.current_business_id() and public.current_user_role() in ('admin','manager'));
create policy gr_select on public.goods_receipts for select to authenticated using (business_id=public.current_business_id());
create policy gr_lines_select on public.goods_receipt_lines for select to authenticated using (business_id=public.current_business_id());
create policy balances_select on public.stock_balances for select to authenticated using (business_id=public.current_business_id());
create policy movements_select on public.stock_movements for select to authenticated using (business_id=public.current_business_id());

grant select,insert,update,delete on public.purchase_orders,public.purchase_order_lines to authenticated;
grant select on public.goods_receipts,public.goods_receipt_lines,public.stock_balances,public.stock_movements to authenticated;

create or replace function public.create_purchase_order(p_supplier_id uuid,p_order_date date,p_expected_date date,p_supplier_reference text,p_notes text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_role public.user_role:=public.current_user_role(); v_order_id uuid; v_number text; v_item jsonb; v_qty numeric; v_cost numeric; v_discount numeric; v_tax numeric; v_base numeric; v_net numeric; v_subtotal numeric:=0; v_discount_total numeric:=0; v_tax_total numeric:=0; v_grand_total numeric:=0; v_branch uuid;
begin
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

revoke all on function public.create_purchase_order(uuid,date,date,text,text,jsonb) from public;
grant execute on function public.create_purchase_order(uuid,date,date,text,text,jsonb) to authenticated;

create or replace function public.receive_purchase_order(p_order_id uuid,p_lines jsonb,p_supplier_document text default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_role public.user_role:=public.current_user_role(); v_order public.purchase_orders%rowtype; v_item jsonb; v_line public.purchase_order_lines%rowtype; v_qty numeric; v_receipt_id uuid; v_receipt_number text; v_old_qty numeric; v_old_cost numeric; v_new_cost numeric;
begin
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

revoke all on function public.receive_purchase_order(uuid,jsonb,text,text) from public;
grant execute on function public.receive_purchase_order(uuid,jsonb,text,text) to authenticated;
commit;
