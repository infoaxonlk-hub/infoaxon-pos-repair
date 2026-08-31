begin;

create or replace function public.update_business_settings(
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_currency_code text default 'LKR',
  p_timezone text default 'Asia/Colombo'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_business uuid := public.current_business_id();
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator can update business settings';
  end if;
  if nullif(trim(p_name),'') is null then raise exception 'Business name is required'; end if;
  update public.businesses set
    name = trim(p_name), phone = nullif(trim(p_phone),''), email = nullif(trim(p_email),''),
    address = nullif(trim(p_address),''), currency_code = upper(coalesce(nullif(trim(p_currency_code),''),'LKR')),
    timezone = coalesce(nullif(trim(p_timezone),''),'Asia/Colombo')
  where id = v_business;
end;
$$;

create or replace function public.save_branch(
  p_id uuid,
  p_name text,
  p_code text,
  p_phone text default null,
  p_address text default null,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_business uuid := public.current_business_id(); v_id uuid;
begin
  if public.current_user_role() <> 'admin' then raise exception 'Only an administrator can manage branches'; end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_code),'') is null then raise exception 'Branch name and code are required'; end if;
  if p_id is null then
    insert into public.branches(business_id,name,code,phone,address,active)
    values(v_business,trim(p_name),upper(trim(p_code)),nullif(trim(p_phone),''),nullif(trim(p_address),''),p_active)
    returning id into v_id;
  else
    update public.branches set name=trim(p_name),code=upper(trim(p_code)),phone=nullif(trim(p_phone),''),
      address=nullif(trim(p_address),''),active=p_active
    where id=p_id and business_id=v_business returning id into v_id;
    if v_id is null then raise exception 'Branch was not found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.update_staff_profile(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role,
  p_branch_id uuid default null,
  p_phone text default null,
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_business uuid := public.current_business_id();
begin
  if public.current_user_role() <> 'admin' then raise exception 'Only an administrator can manage staff'; end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'Staff name is required'; end if;
  if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and business_id=v_business) then
    raise exception 'Invalid branch';
  end if;
  if p_user_id = auth.uid() and not p_active then raise exception 'You cannot deactivate your own account'; end if;
  update public.profiles set full_name=trim(p_full_name),role=p_role,branch_id=p_branch_id,
    phone=nullif(trim(p_phone),''),active=p_active
  where id=p_user_id and business_id=v_business;
  if not found then raise exception 'Staff profile was not found'; end if;
end;
$$;

revoke all on function public.update_business_settings(text,text,text,text,text,text) from public;
revoke all on function public.save_branch(uuid,text,text,text,text,boolean) from public;
revoke all on function public.update_staff_profile(uuid,text,public.user_role,uuid,text,boolean) from public;
grant execute on function public.update_business_settings(text,text,text,text,text,text) to authenticated;
grant execute on function public.save_branch(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.update_staff_profile(uuid,text,public.user_role,uuid,text,boolean) to authenticated;

commit;
