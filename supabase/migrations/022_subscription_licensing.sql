BEGIN;

CREATE TABLE public.business_subscriptions (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','basic','standard','premium','custom')),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','suspended','cancelled')),
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_fee >= 0),
  additional_module_fee numeric(12,2) NOT NULL DEFAULT 5000 CHECK (additional_module_fee >= 0),
  currency_code text NOT NULL DEFAULT 'LKR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid REFERENCES auth.users(id),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_subscriptions FROM PUBLIC, anon, authenticated;

-- Existing customers keep uninterrupted access until a platform administrator
-- deliberately records an end date or non-access status.
INSERT INTO public.business_subscriptions(business_id, plan, status, starts_on)
SELECT id, 'custom', 'active', current_date FROM public.businesses;

CREATE FUNCTION public.create_default_business_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.business_subscriptions(business_id, plan, status, starts_on, ends_on)
  VALUES (NEW.id, 'trial', 'trial', current_date, current_date + 29);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_default_business_subscription() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER businesses_default_subscription
AFTER INSERT ON public.businesses FOR EACH ROW
EXECUTE FUNCTION public.create_default_business_subscription();

CREATE FUNCTION public.platform_get_business_subscription(p_business uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'business_id',s.business_id,'business_name',b.name,'plan',s.plan,'status',s.status,
      'starts_on',s.starts_on,'ends_on',s.ends_on,'monthly_fee',s.monthly_fee,
      'additional_module_fee',s.additional_module_fee,'currency_code',s.currency_code,
      'notes',s.notes,'revision',s.revision,'updated_at',s.updated_at)
    FROM public.business_subscriptions s JOIN public.businesses b ON b.id=s.business_id
    WHERE s.business_id=p_business
  );
END;
$$;

CREATE FUNCTION public.platform_set_business_subscription(
  p_business uuid, p_expected_revision integer, p_plan text, p_status text,
  p_starts_on date, p_ends_on date, p_monthly_fee numeric,
  p_additional_module_fee numeric, p_notes text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0
    OR p_plan IS NULL OR p_plan NOT IN ('trial','basic','standard','premium','custom')
    OR p_status IS NULL OR p_status NOT IN ('trial','active','past_due','suspended','cancelled')
    OR p_starts_on IS NULL OR (p_ends_on IS NOT NULL AND p_ends_on < p_starts_on)
    OR p_monthly_fee IS NULL OR p_monthly_fee < 0 OR p_monthly_fee > 9999999999.99
    OR p_additional_module_fee IS NULL OR p_additional_module_fee < 0 OR p_additional_module_fee > 9999999999.99
    OR length(coalesce(p_notes,'')) > 500 THEN
    RAISE EXCEPTION 'Invalid subscription details' USING ERRCODE='22023';
  END IF;
  UPDATE public.business_subscriptions SET
    plan=p_plan,status=p_status,starts_on=p_starts_on,ends_on=p_ends_on,
    monthly_fee=round(p_monthly_fee,2),additional_module_fee=round(p_additional_module_fee,2),
    notes=nullif(btrim(p_notes),''),revision=revision+1,
    updated_at=clock_timestamp(),updated_by=auth.uid()
  WHERE business_id=p_business AND revision=p_expected_revision;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription changed; refresh and retry' USING ERRCODE='40001'; END IF;
END;
$$;

CREATE FUNCTION public.platform_list_subscription_overview()
RETURNS TABLE(business_id uuid,status text,plan text,ends_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT s.business_id,s.status,s.plan,s.ends_on FROM public.business_subscriptions s;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_get_business_subscription(uuid),
 public.platform_set_business_subscription(uuid,integer,text,text,date,date,numeric,numeric,text),
 public.platform_list_subscription_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_business_subscription(uuid),
 public.platform_set_business_subscription(uuid,integer,text,text,date,date,numeric,numeric,text),
 public.platform_list_subscription_overview() TO authenticated;

-- Subscription checks are part of the tenant identity helpers used by RLS and RPCs.
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_status text; v_start date; v_end date;
BEGIN
  SELECT p.business_id,s.status,s.starts_on,s.ends_on INTO v_id,v_status,v_start,v_end
  FROM public.profiles p JOIN public.businesses b ON b.id=p.business_id
  LEFT JOIN public.business_subscriptions s ON s.business_id=b.id
  WHERE p.id=auth.uid() AND p.active IS TRUE AND b.active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active staff and business required' USING ERRCODE='42501'; END IF;
  IF v_status IS NULL OR v_status NOT IN ('trial','active') OR current_date < v_start
     OR (v_end IS NOT NULL AND current_date > v_end) THEN
    RAISE EXCEPTION 'Subscription access required' USING ERRCODE='P0001';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role public.user_role;
BEGIN
  PERFORM public.current_business_id();
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id=auth.uid() AND p.active IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active staff required' USING ERRCODE='42501'; END IF;
  RETURN v_role;
END;
$$;

COMMIT;
