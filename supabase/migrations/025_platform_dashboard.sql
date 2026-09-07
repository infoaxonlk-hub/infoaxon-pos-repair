BEGIN;

CREATE FUNCTION public.platform_dashboard_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'total_businesses',(SELECT count(*) FROM public.businesses),
    'active_businesses',(SELECT count(*) FROM public.businesses WHERE active),
    'inactive_businesses',(SELECT count(*) FROM public.businesses WHERE NOT active),
    'trial_subscriptions',(SELECT count(*) FROM public.business_subscriptions WHERE status='trial' AND current_date BETWEEN starts_on AND coalesce(ends_on,current_date)),
    'active_subscriptions',(SELECT count(*) FROM public.business_subscriptions WHERE status='active' AND current_date>=starts_on AND (ends_on IS NULL OR current_date<=ends_on)),
    'blocked_subscriptions',(SELECT count(*) FROM public.business_subscriptions WHERE status NOT IN ('trial','active') OR current_date<starts_on OR (ends_on IS NOT NULL AND current_date>ends_on)),
    'expiring_7_days',(SELECT count(*) FROM public.business_subscriptions WHERE status IN ('trial','active') AND ends_on BETWEEN current_date AND current_date+7),
    'expiring_30_days',(SELECT count(*) FROM public.business_subscriptions WHERE status IN ('trial','active') AND ends_on BETWEEN current_date AND current_date+30),
    'monthly_recurring_fee',(SELECT coalesce(sum(monthly_fee),0) FROM public.business_subscriptions WHERE status IN ('trial','active') AND current_date>=starts_on AND (ends_on IS NULL OR current_date<=ends_on)),
    'enabled_modules',(SELECT coalesce(sum(cardinality(enabled_modules)),0) FROM public.businesses WHERE active),
    'active_branches',(SELECT count(*) FROM public.branches WHERE active),
    'active_client_admins',(SELECT count(*) FROM public.profiles WHERE role='admin' AND active)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.platform_subscription_attention()
RETURNS TABLE(business_id uuid,business_name text,business_code text,plan text,status text,
  ends_on date,days_remaining integer,monthly_fee numeric,currency_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT b.id,b.name,b.code,s.plan,s.status,s.ends_on,
    CASE WHEN s.ends_on IS NULL THEN NULL ELSE (s.ends_on-current_date)::integer END,
    s.monthly_fee,s.currency_code
  FROM public.businesses b JOIN public.business_subscriptions s ON s.business_id=b.id
  WHERE b.active IS NOT TRUE OR s.status NOT IN ('trial','active') OR current_date<s.starts_on
    OR (s.ends_on IS NOT NULL AND s.ends_on<=current_date+30)
  ORDER BY
    CASE WHEN b.active IS NOT TRUE OR s.status NOT IN ('trial','active') OR current_date<s.starts_on OR (s.ends_on IS NOT NULL AND s.ends_on<current_date) THEN 0 ELSE 1 END,
    s.ends_on NULLS LAST,b.name,b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_dashboard_summary(),public.platform_subscription_attention() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_dashboard_summary(),public.platform_subscription_attention() TO authenticated;

COMMIT;
