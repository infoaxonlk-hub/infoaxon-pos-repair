do $$
declare
  v_user_id uuid;
  v_business_id uuid;
  v_branch_id uuid;
begin
  -- Use the first authentication user created for this project
  select id
  into v_user_id
  from auth.users
  order by created_at asc
  limit 1;

  if v_user_id is null then
    raise exception 'No authentication user was found.';
  end if;

  -- Create the initial business
  insert into public.businesses (
    name,
    code,
    currency_code,
    timezone
  )
  values (
    'Demo Mobile and Repair Shop',
    'DEMO-MOBILE-001',
    'LKR',
    'Asia/Colombo'
  )
  on conflict (code)
  do update set
    name = excluded.name,
    currency_code = excluded.currency_code,
    timezone = excluded.timezone
  returning id into v_business_id;

  -- Create the main branch
  insert into public.branches (
    business_id,
    name,
    code
  )
  values (
    v_business_id,
    'Main Branch',
    'MAIN'
  )
  on conflict (business_id, code)
  do update set
    name = excluded.name
  returning id into v_branch_id;

  -- Link the authentication user as the system administrator
  insert into public.profiles (
    id,
    business_id,
    branch_id,
    full_name,
    role,
    active
  )
  values (
    v_user_id,
    v_business_id,
    v_branch_id,
    'System Administrator',
    'admin',
    true
  )
  on conflict (id)
  do update set
    business_id = excluded.business_id,
    branch_id = excluded.branch_id,
    full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active;
end;
$$;