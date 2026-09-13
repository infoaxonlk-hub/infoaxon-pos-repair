BEGIN;

CREATE FUNCTION public.platform_health_issues()
RETURNS TABLE(issue_code text,severity text,business_id uuid,business_name text,business_code text,detail text,action_path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT * FROM (
    SELECT 'subscription_access'::text,'critical'::text,b.id,b.name,b.code,
      'No currently accessible trial or active subscription.'::text,('/platform/businesses/'||b.id||'/subscription')::text
    FROM public.businesses b WHERE b.active AND NOT EXISTS(
      SELECT 1 FROM public.business_subscriptions s WHERE s.business_id=b.id AND s.status IN ('trial','active')
      AND current_date>=s.starts_on AND (s.ends_on IS NULL OR current_date<=s.ends_on))
    UNION ALL
    SELECT 'main_branch','critical',b.id,b.name,b.code,'No active main branch is configured.',('/platform/businesses/'||b.id||'/branches')
    FROM public.businesses b WHERE b.active AND NOT EXISTS(SELECT 1 FROM public.branches br WHERE br.business_id=b.id AND br.is_main AND br.active)
    UNION ALL
    SELECT 'client_admin','critical',b.id,b.name,b.code,'No active client administrator is available.',('/platform/admins?business='||b.id)
    FROM public.businesses b WHERE b.active AND NOT EXISTS(
      SELECT 1 FROM public.profiles p WHERE p.business_id=b.id AND p.role='admin' AND p.active
      AND NOT EXISTS(SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=p.id))
    UNION ALL
    SELECT 'modules','warning',b.id,b.name,b.code,'No optional business modules are enabled.',('/platform/businesses/'||b.id||'/modules')
    FROM public.businesses b WHERE b.active AND cardinality(b.enabled_modules)=0
    UNION ALL
    SELECT 'business_profile','warning',b.id,b.name,b.code,'Phone, email or address is incomplete.',('/platform/businesses/'||b.id)
    FROM public.businesses b WHERE b.active AND (nullif(btrim(coalesce(b.phone,'')),'') IS NULL
      OR nullif(btrim(coalesce(b.email,'')),'') IS NULL OR nullif(btrim(coalesce(b.address,'')),'') IS NULL)
    UNION ALL
    SELECT 'branding','warning',b.id,b.name,b.code,'The client logo has not been uploaded.',('/platform/businesses/'||b.id)
    FROM public.businesses b WHERE b.active AND b.logo_path IS NULL
  ) AS issues(issue_code,severity,business_id,business_name,business_code,detail,action_path)
  ORDER BY CASE issues.severity WHEN 'critical' THEN 0 ELSE 1 END,issues.business_name,issues.issue_code,issues.business_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_health_issues() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_health_issues() TO authenticated;

COMMIT;
