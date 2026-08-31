begin;

create type public.expense_status as enum ('draft','submitted','approved','paid','rejected','voided');

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_business_name_unique unique(business_id,name),
  constraint expense_categories_id_business_unique unique(id,business_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null,
  category_id uuid not null,
  expense_number text not null,
  expense_date date not null default current_date,
  payee text not null,
  description text not null,
  amount numeric(14,2) not null,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null,
  status public.expense_status not null default 'draft',
  payment_method_id uuid,
  payment_reference text,
  attachment_url text,
  notes text,
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  paid_by uuid references public.profiles(id) on delete restrict,
  paid_at timestamptz,
  rejection_reason text,
  void_reason text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_business_number_unique unique(business_id,expense_number),
  constraint expenses_id_business_unique unique(id,business_id),
  constraint expenses_branch_fk foreign key(branch_id,business_id) references public.branches(id,business_id) on delete restrict,
  constraint expenses_category_fk foreign key(category_id,business_id) references public.expense_categories(id,business_id) on delete restrict,
  constraint expenses_payment_method_fk foreign key(payment_method_id,business_id) references public.pos_payment_methods(id,business_id) on delete restrict,
  constraint expenses_amount_check check(amount>0 and tax_amount>=0 and total_amount=round(amount+tax_amount,2))
);

create table public.expense_status_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  expense_id uuid not null,
  old_status public.expense_status,
  new_status public.expense_status not null,
  note text,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint expense_history_expense_fk foreign key(expense_id,business_id) references public.expenses(id,business_id) on delete cascade
);

create index expenses_business_date_idx on public.expenses(business_id,expense_date desc);
create index expenses_status_idx on public.expenses(business_id,status);
create index expenses_category_idx on public.expenses(business_id,category_id);
create index expense_history_idx on public.expense_status_history(expense_id,changed_at desc);

create trigger expense_categories_set_updated_at before update on public.expense_categories
for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses
for each row execute function public.set_updated_at();

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_status_history enable row level security;

create policy expense_categories_select on public.expense_categories for select to authenticated
using(business_id=public.current_business_id());
create policy expense_categories_manage on public.expense_categories for all to authenticated
using(business_id=public.current_business_id() and public.current_user_role() in ('admin','manager'))
with check(business_id=public.current_business_id() and public.current_user_role() in ('admin','manager'));
create policy expenses_select on public.expenses for select to authenticated
using(business_id=public.current_business_id());
create policy expense_history_select on public.expense_status_history for select to authenticated
using(business_id=public.current_business_id());

grant select,insert,update,delete on public.expense_categories to authenticated;
grant select on public.expenses,public.expense_status_history to authenticated;

create or replace function public.create_expense(
  p_branch_id uuid,p_category_id uuid,p_expense_date date,p_payee text,
  p_description text,p_amount numeric,p_tax_amount numeric default 0,
  p_notes text default null,p_attachment_url text default null,p_submit boolean default true
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_id uuid;v_number text;v_status public.expense_status;
begin
  if v_business is null then raise exception 'User profile was not found'; end if;
  if trim(coalesce(p_payee,''))='' then raise exception 'Payee is required'; end if;
  if trim(coalesce(p_description,''))='' then raise exception 'Description is required'; end if;
  if coalesce(p_amount,0)<=0 or coalesce(p_tax_amount,0)<0 then raise exception 'Enter valid amounts'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and business_id=v_business and active) then raise exception 'Invalid branch'; end if;
  if not exists(select 1 from public.expense_categories where id=p_category_id and business_id=v_business and active) then raise exception 'Invalid expense category'; end if;
  v_number:='EXP-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');v_status:=case when p_submit then 'submitted' else 'draft' end;
  insert into public.expenses(business_id,branch_id,category_id,expense_number,expense_date,payee,description,amount,tax_amount,total_amount,status,notes,attachment_url,submitted_at,created_by)
  values(v_business,p_branch_id,p_category_id,v_number,coalesce(p_expense_date,current_date),trim(p_payee),trim(p_description),round(p_amount,2),round(coalesce(p_tax_amount,0),2),round(p_amount+coalesce(p_tax_amount,0),2),v_status,nullif(trim(p_notes),''),nullif(trim(p_attachment_url),''),case when p_submit then now() end,auth.uid()) returning id into v_id;
  insert into public.expense_status_history(business_id,expense_id,new_status,note,changed_by) values(v_business,v_id,v_status,'Expense created',auth.uid());
  return v_id;
end;$$;

create or replace function public.change_expense_status(p_expense_id uuid,p_new_status public.expense_status,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_old public.expense_status;v_role text:=public.current_user_role();
begin
 select status into v_old from public.expenses where id=p_expense_id and business_id=v_business for update;
 if v_old is null then raise exception 'Expense was not found'; end if;
 if v_old in ('paid','voided') then raise exception 'This expense is already closed'; end if;
 if p_new_status in ('approved','rejected','voided') and v_role not in ('admin','manager') then raise exception 'Manager approval is required'; end if;
 if p_new_status='approved' and v_old<>'submitted' then raise exception 'Only submitted expenses can be approved'; end if;
 if p_new_status='rejected' and trim(coalesce(p_note,''))='' then raise exception 'Enter a rejection reason'; end if;
 update public.expenses set status=p_new_status,
  submitted_at=case when p_new_status='submitted' then now() else submitted_at end,
  approved_by=case when p_new_status='approved' then auth.uid() else approved_by end,
  approved_at=case when p_new_status='approved' then now() else approved_at end,
  rejection_reason=case when p_new_status='rejected' then trim(p_note) else rejection_reason end,
  void_reason=case when p_new_status='voided' then nullif(trim(p_note),'') else void_reason end
 where id=p_expense_id;
 insert into public.expense_status_history(business_id,expense_id,old_status,new_status,note,changed_by) values(v_business,p_expense_id,v_old,p_new_status,nullif(trim(p_note),''),auth.uid());
end;$$;

create or replace function public.pay_expense(p_expense_id uuid,p_payment_method_id uuid,p_reference text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_business uuid:=public.current_business_id();v_old public.expense_status;
begin
 select status into v_old from public.expenses where id=p_expense_id and business_id=v_business for update;
 if v_old is null then raise exception 'Expense was not found'; end if;
 if v_old<>'approved' then raise exception 'Approve the expense before payment'; end if;
 if not exists(select 1 from public.pos_payment_methods where id=p_payment_method_id and business_id=v_business and active) then raise exception 'Invalid payment method'; end if;
 update public.expenses set status='paid',payment_method_id=p_payment_method_id,payment_reference=nullif(trim(p_reference),''),paid_by=auth.uid(),paid_at=now() where id=p_expense_id;
 insert into public.expense_status_history(business_id,expense_id,old_status,new_status,note,changed_by) values(v_business,p_expense_id,v_old,'paid','Expense paid',auth.uid());
end;$$;

insert into public.expense_categories(business_id,name,description)
select b.id,c.name,c.description from public.businesses b cross join(values
 ('Rent','Building and shop rent'),('Utilities','Electricity, water and internet'),
 ('Transport','Fuel and transport'),('Salaries','Staff salaries and wages'),
 ('Maintenance','Repairs and maintenance'),('Office','Office and stationery'),
 ('Marketing','Advertising and promotions'),('Other','Other business expenses')
)as c(name,description) on conflict(business_id,name)do nothing;

revoke all on function public.create_expense(uuid,uuid,date,text,text,numeric,numeric,text,text,boolean) from public;
revoke all on function public.change_expense_status(uuid,public.expense_status,text) from public;
revoke all on function public.pay_expense(uuid,uuid,text) from public;
grant execute on function public.create_expense(uuid,uuid,date,text,text,numeric,numeric,text,text,boolean) to authenticated;
grant execute on function public.change_expense_status(uuid,public.expense_status,text) to authenticated;
grant execute on function public.pay_expense(uuid,uuid,text) to authenticated;

commit;

