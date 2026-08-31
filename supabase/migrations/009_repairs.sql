begin;

create type public.repair_status as enum (
  'received', 'diagnosing', 'awaiting_approval', 'waiting_for_parts',
  'repairing', 'ready', 'delivered', 'cancelled'
);

create type public.repair_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.repair_payment_kind as enum ('advance', 'payment', 'refund');

create table public.repair_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  job_number text not null,
  customer_id uuid not null,
  technician_id uuid,
  status public.repair_status not null default 'received',
  priority public.repair_priority not null default 'normal',
  device_type text not null,
  brand text,
  model text,
  imei_serial text,
  device_password text,
  device_condition text,
  received_accessories text,
  reported_fault text not null,
  diagnosis text,
  work_done text,
  internal_notes text,
  estimated_cost numeric(14,2) not null default 0,
  service_charge numeric(14,2) not null default 0,
  parts_total numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  promised_date date,
  customer_approved_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_jobs_business_number_unique unique (business_id,job_number),
  constraint repair_jobs_id_business_unique unique (id,business_id),
  constraint repair_jobs_branch_fk foreign key (branch_id,business_id) references public.branches(id,business_id) on delete restrict,
  constraint repair_jobs_customer_fk foreign key (customer_id,business_id) references public.customers(id,business_id) on delete restrict,
  constraint repair_jobs_amounts_check check (
    estimated_cost>=0 and service_charge>=0 and parts_total>=0 and discount_amount>=0
    and tax_amount>=0 and grand_total>=0 and paid_total>=0 and balance_due>=0
  )
);

create table public.repair_job_parts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  repair_job_id uuid not null,
  product_id uuid not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2) not null default 0,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint repair_parts_job_fk foreign key (repair_job_id,business_id) references public.repair_jobs(id,business_id) on delete cascade,
  constraint repair_parts_product_fk foreign key (product_id,business_id) references public.products(id,business_id) on delete restrict,
  constraint repair_parts_values_check check (quantity>0 and unit_cost>=0 and unit_price>=0 and line_total>=0)
);

create table public.repair_job_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  repair_job_id uuid not null,
  payment_kind public.repair_payment_kind not null default 'payment',
  payment_method_id uuid,
  amount numeric(14,2) not null,
  reference_number text,
  notes text,
  paid_at timestamptz not null default now(),
  received_by uuid not null references public.profiles(id) on delete restrict,
  constraint repair_payments_job_fk foreign key (repair_job_id,business_id) references public.repair_jobs(id,business_id) on delete cascade,
  constraint repair_payments_method_fk foreign key (payment_method_id,business_id) references public.pos_payment_methods(id,business_id) on delete restrict,
  constraint repair_payments_amount_check check (amount>0)
);

create table public.repair_status_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  repair_job_id uuid not null,
  old_status public.repair_status,
  new_status public.repair_status not null,
  note text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint repair_history_job_fk foreign key (repair_job_id,business_id) references public.repair_jobs(id,business_id) on delete cascade
);

create index repair_jobs_business_status_idx on public.repair_jobs(business_id,status,created_at desc);
create index repair_jobs_customer_idx on public.repair_jobs(business_id,customer_id);
create index repair_jobs_technician_idx on public.repair_jobs(business_id,technician_id);
create index repair_parts_job_idx on public.repair_job_parts(repair_job_id);
create index repair_payments_job_idx on public.repair_job_payments(repair_job_id);
create index repair_history_job_idx on public.repair_status_history(repair_job_id,changed_at desc);

create trigger repair_jobs_set_updated_at before update on public.repair_jobs
for each row execute function public.set_updated_at();

alter table public.repair_jobs enable row level security;
alter table public.repair_job_parts enable row level security;
alter table public.repair_job_payments enable row level security;
alter table public.repair_status_history enable row level security;

create policy repair_jobs_select on public.repair_jobs for select to authenticated
using (business_id=public.current_business_id());
create policy repair_parts_select on public.repair_job_parts for select to authenticated
using (business_id=public.current_business_id());
create policy repair_payments_select on public.repair_job_payments for select to authenticated
using (business_id=public.current_business_id());
create policy repair_history_select on public.repair_status_history for select to authenticated
using (business_id=public.current_business_id());

grant select on public.repair_jobs,public.repair_job_parts,public.repair_job_payments,public.repair_status_history to authenticated;

create or replace function public.recalculate_repair_job(p_job_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_business uuid:=public.current_business_id();
  v_parts numeric:=0;
  v_paid numeric:=0;
begin
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

create or replace function public.update_repair_work(
  p_job_id uuid, p_technician_id uuid default null, p_diagnosis text default null,
  p_work_done text default null, p_internal_notes text default null,
  p_service_charge numeric default 0, p_discount_amount numeric default 0,
  p_tax_amount numeric default 0, p_customer_approved boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); begin
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

create or replace function public.change_repair_status(
  p_job_id uuid, p_new_status public.repair_status, p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_old public.repair_status; begin
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

create or replace function public.add_repair_part(
  p_job_id uuid, p_product_id uuid, p_quantity numeric, p_unit_price numeric default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_business uuid:=public.current_business_id(); v_job public.repair_jobs%rowtype;
  v_product public.products%rowtype; v_stock numeric:=0; v_id uuid; v_price numeric;
begin
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

create or replace function public.add_repair_payment(
  p_job_id uuid, p_payment_method_id uuid, p_amount numeric,
  p_payment_kind public.repair_payment_kind default 'payment',
  p_reference_number text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id(); v_id uuid; begin
  if coalesce(p_amount,0)<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  if not exists(select 1 from public.repair_jobs where id=p_job_id and business_id=v_business) then raise exception 'Repair job was not found'; end if;
  if not exists(select 1 from public.pos_payment_methods where id=p_payment_method_id and business_id=v_business and active) then raise exception 'Invalid payment method'; end if;
  insert into public.repair_job_payments(business_id,repair_job_id,payment_kind,payment_method_id,amount,reference_number,notes,received_by)
  values(v_business,p_job_id,p_payment_kind,p_payment_method_id,p_amount,nullif(trim(p_reference_number),''),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  perform public.recalculate_repair_job(p_job_id);
  return v_id;
end; $$;

revoke all on function public.recalculate_repair_job(uuid) from public;
revoke all on function public.create_repair_job(uuid,uuid,text,text,text,text,text,text,text,text,public.repair_priority,date,numeric,uuid) from public;
revoke all on function public.update_repair_work(uuid,uuid,text,text,text,numeric,numeric,numeric,boolean) from public;
revoke all on function public.change_repair_status(uuid,public.repair_status,text) from public;
revoke all on function public.add_repair_part(uuid,uuid,numeric,numeric) from public;
revoke all on function public.add_repair_payment(uuid,uuid,numeric,public.repair_payment_kind,text,text) from public;

grant execute on function public.create_repair_job(uuid,uuid,text,text,text,text,text,text,text,text,public.repair_priority,date,numeric,uuid) to authenticated;
grant execute on function public.update_repair_work(uuid,uuid,text,text,text,numeric,numeric,numeric,boolean) to authenticated;
grant execute on function public.change_repair_status(uuid,public.repair_status,text) to authenticated;
grant execute on function public.add_repair_part(uuid,uuid,numeric,numeric) to authenticated;
grant execute on function public.add_repair_payment(uuid,uuid,numeric,public.repair_payment_kind,text,text) to authenticated;

commit;
