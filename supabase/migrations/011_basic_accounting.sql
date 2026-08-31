begin;

create type public.money_direction as enum ('in','out');
create type public.supplier_bill_status as enum ('unpaid','partially_paid','paid','voided');

create table public.customer_receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  customer_id uuid not null,
  receipt_number text not null,
  receipt_date date not null default current_date,
  amount numeric(14,2) not null check(amount>0),
  payment_method_id uuid not null,
  reference_number text,
  notes text,
  received_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint customer_receipts_number_unique unique(business_id,receipt_number),
  constraint customer_receipts_branch_fk foreign key(branch_id,business_id) references public.branches(id,business_id) on delete restrict,
  constraint customer_receipts_customer_fk foreign key(customer_id,business_id) references public.customers(id,business_id) on delete restrict,
  constraint customer_receipts_method_fk foreign key(payment_method_id,business_id) references public.pos_payment_methods(id,business_id) on delete restrict
);

create table public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  supplier_id uuid not null,
  purchase_order_id uuid,
  bill_number text not null,
  supplier_invoice_number text,
  bill_date date not null default current_date,
  due_date date,
  total_amount numeric(14,2) not null check(total_amount>0),
  paid_amount numeric(14,2) not null default 0 check(paid_amount>=0),
  balance_due numeric(14,2) not null check(balance_due>=0),
  status public.supplier_bill_status not null default 'unpaid',
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_bills_number_unique unique(business_id,bill_number),
  constraint supplier_bills_po_unique unique(business_id,purchase_order_id),
  constraint supplier_bills_id_business_unique unique(id,business_id),
  constraint supplier_bills_branch_fk foreign key(branch_id,business_id) references public.branches(id,business_id) on delete restrict,
  constraint supplier_bills_supplier_fk foreign key(supplier_id,business_id) references public.suppliers(id,business_id) on delete restrict,
  constraint supplier_bills_po_fk foreign key(purchase_order_id,business_id) references public.purchase_orders(id,business_id) on delete restrict,
  constraint supplier_bills_paid_check check(paid_amount<=total_amount)
);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  supplier_bill_id uuid not null,
  payment_number text not null,
  payment_date date not null default current_date,
  amount numeric(14,2) not null check(amount>0),
  payment_method_id uuid not null,
  reference_number text,
  notes text,
  paid_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint supplier_payments_number_unique unique(business_id,payment_number),
  constraint supplier_payments_bill_fk foreign key(supplier_bill_id,business_id) references public.supplier_bills(id,business_id) on delete restrict,
  constraint supplier_payments_method_fk foreign key(payment_method_id,business_id) references public.pos_payment_methods(id,business_id) on delete restrict
);

create table public.cashbook_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  transaction_date date not null default current_date,
  direction public.money_direction not null,
  payment_method_id uuid not null,
  amount numeric(14,2) not null check(amount>0),
  source_type text not null,
  source_id uuid,
  reference_number text,
  description text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint cashbook_source_unique unique nulls not distinct(business_id,source_type,source_id),
  constraint cashbook_branch_fk foreign key(branch_id,business_id) references public.branches(id,business_id) on delete restrict,
  constraint cashbook_method_fk foreign key(payment_method_id,business_id) references public.pos_payment_methods(id,business_id) on delete restrict
);

create index customer_receipts_customer_idx on public.customer_receipts(business_id,customer_id,receipt_date desc);
create index supplier_bills_supplier_idx on public.supplier_bills(business_id,supplier_id,status);
create index supplier_payments_bill_idx on public.supplier_payments(supplier_bill_id,payment_date desc);
create index cashbook_business_date_idx on public.cashbook_transactions(business_id,transaction_date desc);
create trigger supplier_bills_set_updated_at before update on public.supplier_bills for each row execute function public.set_updated_at();

alter table public.customer_receipts enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.cashbook_transactions enable row level security;
create policy customer_receipts_select on public.customer_receipts for select to authenticated using(business_id=public.current_business_id());
create policy supplier_bills_select on public.supplier_bills for select to authenticated using(business_id=public.current_business_id());
create policy supplier_payments_select on public.supplier_payments for select to authenticated using(business_id=public.current_business_id());
create policy cashbook_select on public.cashbook_transactions for select to authenticated using(business_id=public.current_business_id());
grant select on public.customer_receipts,public.supplier_bills,public.supplier_payments,public.cashbook_transactions to authenticated;

create or replace view public.customer_outstanding_summary with(security_invoker=true) as
select c.id customer_id,c.business_id,c.code,c.name,c.phone,
 round(c.opening_balance
  +coalesce((select sum(sp.amount) from public.pos_sales ps join public.pos_sale_payments sp on sp.sale_id=ps.id join public.pos_payment_methods pm on pm.id=sp.payment_method_id where ps.customer_id=c.id and ps.status in('completed','partially_refunded','refunded') and pm.payment_kind='credit'),0)
  +coalesce((select sum(r.balance_due) from public.repair_jobs r where r.customer_id=c.id and r.status<>'cancelled'),0)
  -coalesce((select sum(cr.amount) from public.customer_receipts cr where cr.customer_id=c.id),0),2) outstanding
from public.customers c where c.active;

create or replace view public.supplier_outstanding_summary with(security_invoker=true) as
select s.id supplier_id,s.business_id,s.code,s.name,s.phone,
 round(s.opening_balance+coalesce((select sum(b.balance_due) from public.supplier_bills b where b.supplier_id=s.id and b.status<>'voided'),0),2) outstanding
from public.suppliers s where s.active;

create or replace view public.cash_bank_summary with(security_invoker=true) as
select pm.business_id,pm.id payment_method_id,pm.name,pm.payment_kind,
 round(coalesce(sum(case when ct.direction='in' then ct.amount else -ct.amount end),0),2) balance
from public.pos_payment_methods pm left join public.cashbook_transactions ct on ct.payment_method_id=pm.id
where pm.active group by pm.business_id,pm.id,pm.name,pm.payment_kind;

grant select on public.customer_outstanding_summary,public.supplier_outstanding_summary,public.cash_bank_summary to authenticated;

create or replace function public.record_customer_receipt(p_branch_id uuid,p_customer_id uuid,p_amount numeric,p_payment_method_id uuid,p_reference text default null,p_notes text default null,p_receipt_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_id uuid;v_number text;
begin
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

create or replace function public.create_supplier_bill(p_purchase_order_id uuid,p_supplier_invoice text default null,p_bill_date date default current_date,p_due_date date default null,p_notes text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_po public.purchase_orders%rowtype;v_id uuid;v_number text;v_terms int;
begin
 select * into v_po from public.purchase_orders where id=p_purchase_order_id and business_id=v_business and status in('partially_received','received');
 if not found then raise exception 'Select a received purchase order'; end if;
 if v_po.branch_id is null then raise exception 'The purchase order does not have a branch'; end if;
 select payment_terms_days into v_terms from public.suppliers where id=v_po.supplier_id;
 v_number:='BILL-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');
 insert into public.supplier_bills(business_id,branch_id,supplier_id,purchase_order_id,bill_number,supplier_invoice_number,bill_date,due_date,total_amount,balance_due,notes,created_by)
 values(v_business,v_po.branch_id,v_po.supplier_id,v_po.id,v_number,nullif(trim(p_supplier_invoice),''),coalesce(p_bill_date,current_date),coalesce(p_due_date,coalesce(p_bill_date,current_date)+v_terms),v_po.grand_total,v_po.grand_total,nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.record_supplier_payment(p_supplier_bill_id uuid,p_amount numeric,p_payment_method_id uuid,p_reference text default null,p_notes text default null,p_payment_date date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_bill public.supplier_bills%rowtype;v_id uuid;v_number text;v_new_paid numeric;
begin
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

revoke all on function public.record_customer_receipt(uuid,uuid,numeric,uuid,text,text,date) from public;
revoke all on function public.create_supplier_bill(uuid,text,date,date,text) from public;
revoke all on function public.record_supplier_payment(uuid,numeric,uuid,text,text,date) from public;
grant execute on function public.record_customer_receipt(uuid,uuid,numeric,uuid,text,text,date) to authenticated;
grant execute on function public.create_supplier_bill(uuid,text,date,date,text) to authenticated;
grant execute on function public.record_supplier_payment(uuid,numeric,uuid,text,text,date) to authenticated;

commit;
