BEGIN;

ALTER TABLE public.branches
  ADD COLUMN is_main boolean NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY business_id
    ORDER BY (upper(code) = 'MAIN') DESC, created_at, id
  ) AS position
  FROM public.branches
)
UPDATE public.branches b
SET is_main = true
FROM ranked r
WHERE r.id = b.id AND r.position = 1;

CREATE UNIQUE INDEX branches_one_main_per_business
  ON public.branches (business_id) WHERE is_main;

CREATE FUNCTION public.ensure_first_branch_is_main()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.business_id=NEW.business_id) THEN
    NEW.is_main:=true;
    NEW.active:=true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER branches_ensure_first_main
  BEFORE INSERT ON public.branches FOR EACH ROW
  EXECUTE FUNCTION public.ensure_first_branch_is_main();

CREATE FUNCTION public.platform_list_business_branches(p_business uuid)
RETURNS TABLE(
  id uuid, name text, code text, phone text, address text, active boolean,
  is_main boolean, updated_at timestamptz, staff_count bigint,
  open_pos_sessions bigint, open_repairs bigint, open_purchase_orders bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id=p_business) THEN
    RAISE EXCEPTION 'Business was not found' USING ERRCODE='P0002';
  END IF;
  RETURN QUERY SELECT br.id,br.name,br.code,br.phone,br.address,br.active,br.is_main,
    br.updated_at,
    (SELECT count(*) FROM public.profiles p WHERE p.business_id=p_business AND p.branch_id=br.id AND p.active),
    (SELECT count(*) FROM public.pos_sessions s WHERE s.business_id=p_business AND s.branch_id=br.id AND s.status='open'),
    (SELECT count(*) FROM public.repair_jobs r WHERE r.business_id=p_business AND r.branch_id=br.id AND r.status NOT IN ('delivered','cancelled')),
    (SELECT count(*) FROM public.purchase_orders po WHERE po.business_id=p_business AND po.branch_id=br.id AND po.status IN ('draft','confirmed','partially_received'))
  FROM public.branches br WHERE br.business_id=p_business
  ORDER BY br.is_main DESC,br.active DESC,br.name,br.id;
END;
$$;

CREATE FUNCTION public.platform_save_business_branch(
  p_business uuid, p_id uuid, p_expected_updated_at timestamptz,
  p_name text, p_code text, p_phone text, p_address text,
  p_active boolean, p_is_main boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid; v_name text:=btrim(p_name); v_code text:=upper(btrim(p_code));
  v_current public.branches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id=p_business) THEN
    RAISE EXCEPTION 'Business was not found' USING ERRCODE='P0002';
  END IF;
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 100 OR
     v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,19}$' THEN
    RAISE EXCEPTION 'Check the branch name and code' USING ERRCODE='22023';
  END IF;
  IF p_id IS NULL THEN
    IF p_is_main THEN
      UPDATE public.branches SET is_main=false WHERE business_id=p_business AND is_main;
    END IF;
    INSERT INTO public.branches(business_id,name,code,phone,address,active,is_main)
    VALUES(p_business,v_name,v_code,nullif(btrim(p_phone),''),nullif(btrim(p_address),''),
      CASE WHEN p_is_main THEN true ELSE coalesce(p_active,true) END,p_is_main)
    RETURNING public.branches.id INTO v_id;
  ELSE
    SELECT * INTO v_current FROM public.branches br
      WHERE br.id=p_id AND br.business_id=p_business FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Branch was not found' USING ERRCODE='P0002'; END IF;
    IF p_expected_updated_at IS NULL OR v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Branch changed in another tab' USING ERRCODE='40001';
    END IF;
    IF v_current.is_main AND (p_active IS NOT TRUE OR p_is_main IS NOT TRUE) THEN
      RAISE EXCEPTION 'The main branch must remain active and main' USING ERRCODE='23514';
    END IF;
    IF p_active IS NOT TRUE AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.business_id=p_business AND p.branch_id=p_id AND p.active) OR
      EXISTS (SELECT 1 FROM public.pos_sessions s WHERE s.business_id=p_business AND s.branch_id=p_id AND s.status='open') OR
      EXISTS (SELECT 1 FROM public.repair_jobs r WHERE r.business_id=p_business AND r.branch_id=p_id AND r.status NOT IN ('delivered','cancelled')) OR
      EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.business_id=p_business AND po.branch_id=p_id AND po.status IN ('draft','confirmed','partially_received'))
    ) THEN
      RAISE EXCEPTION 'Move active staff and complete open work before deactivating this branch' USING ERRCODE='23514';
    END IF;
    IF p_is_main AND NOT v_current.is_main THEN
      UPDATE public.branches SET is_main=false WHERE business_id=p_business AND is_main;
    END IF;
    UPDATE public.branches SET name=v_name,code=v_code,
      phone=nullif(btrim(p_phone),''),address=nullif(btrim(p_address),''),
      active=CASE WHEN p_is_main THEN true ELSE coalesce(p_active,false) END,
      is_main=p_is_main
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Branch code already exists' USING ERRCODE='23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.save_branch(
  p_id uuid,p_name text,p_code text,p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,p_active boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_business uuid:=public.current_business_id(); v_id uuid; v_branch public.branches%ROWTYPE;
BEGIN
  IF public.current_user_role()<>'admin' THEN RAISE EXCEPTION 'Only an administrator can manage branches'; END IF;
  IF nullif(trim(p_name),'') IS NULL OR nullif(trim(p_code),'') IS NULL THEN RAISE EXCEPTION 'Branch name and code are required'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.branches(business_id,name,code,phone,address,active,is_main)
    VALUES(v_business,trim(p_name),upper(trim(p_code)),nullif(trim(p_phone),''),nullif(trim(p_address),''),p_active,false)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_branch FROM public.branches WHERE id=p_id AND business_id=v_business FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Branch was not found'; END IF;
    IF v_branch.is_main AND p_active IS NOT TRUE THEN RAISE EXCEPTION 'The main branch cannot be deactivated'; END IF;
    IF p_active IS NOT TRUE AND (
      EXISTS(SELECT 1 FROM public.profiles WHERE business_id=v_business AND branch_id=p_id AND active) OR
      EXISTS(SELECT 1 FROM public.pos_sessions WHERE business_id=v_business AND branch_id=p_id AND status='open') OR
      EXISTS(SELECT 1 FROM public.repair_jobs WHERE business_id=v_business AND branch_id=p_id AND status NOT IN ('delivered','cancelled')) OR
      EXISTS(SELECT 1 FROM public.purchase_orders WHERE business_id=v_business AND branch_id=p_id AND status IN ('draft','confirmed','partially_received'))
    ) THEN RAISE EXCEPTION 'Move active staff and complete open work before deactivating this branch'; END IF;
    UPDATE public.branches SET name=trim(p_name),code=upper(trim(p_code)),phone=nullif(trim(p_phone),''),
      address=nullif(trim(p_address),''),active=p_active WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_business_branches(uuid),
  public.platform_save_business_branch(uuid,uuid,timestamptz,text,text,text,text,boolean,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_business_branches(uuid),
  public.platform_save_business_branch(uuid,uuid,timestamptz,text,text,text,text,boolean,boolean)
  TO authenticated;

COMMIT;
