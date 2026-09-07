BEGIN;

CREATE FUNCTION public.platform_business_readiness(p_business uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
    'business_id',b.id,'business_name',b.name,'business_code',b.code,
    'business_active',b.active,
    'profile_complete',(nullif(btrim(coalesce(b.phone,'')),'') IS NOT NULL
      AND nullif(btrim(coalesce(b.email,'')),'') IS NOT NULL
      AND nullif(btrim(coalesce(b.address,'')),'') IS NOT NULL),
    'branding_complete',(b.logo_path IS NOT NULL),
    'subscription_complete',EXISTS(
      SELECT 1 FROM public.business_subscriptions s WHERE s.business_id=b.id
      AND s.status IN ('trial','active') AND current_date>=s.starts_on
      AND (s.ends_on IS NULL OR current_date<=s.ends_on)),
    'modules_complete',(cardinality(b.enabled_modules)>0),
    'enabled_module_count',cardinality(b.enabled_modules),
    'main_branch_complete',EXISTS(
      SELECT 1 FROM public.branches br WHERE br.business_id=b.id AND br.is_main AND br.active),
    'active_admin_complete',EXISTS(
      SELECT 1 FROM public.profiles p WHERE p.business_id=b.id AND p.role='admin' AND p.active
      AND NOT EXISTS(SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=p.id)),
    'completed_steps',
      (nullif(btrim(coalesce(b.phone,'')),'') IS NOT NULL AND nullif(btrim(coalesce(b.email,'')),'') IS NOT NULL AND nullif(btrim(coalesce(b.address,'')),'') IS NOT NULL)::integer
      +(b.logo_path IS NOT NULL)::integer
      +(EXISTS(SELECT 1 FROM public.business_subscriptions s WHERE s.business_id=b.id AND s.status IN ('trial','active') AND current_date>=s.starts_on AND (s.ends_on IS NULL OR current_date<=s.ends_on)))::integer
      +(cardinality(b.enabled_modules)>0)::integer
      +(EXISTS(SELECT 1 FROM public.branches br WHERE br.business_id=b.id AND br.is_main AND br.active))::integer
      +(EXISTS(SELECT 1 FROM public.profiles p WHERE p.business_id=b.id AND p.role='admin' AND p.active AND NOT EXISTS(SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=p.id)))::integer,
    'total_steps',6
  ) INTO result FROM public.businesses b WHERE b.id=p_business;
  RETURN result;
END;
$$;

CREATE FUNCTION public.platform_readiness_overview()
RETURNS TABLE(business_id uuid,completed_steps integer,total_steps integer,ready boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT b.id,
    ((nullif(btrim(coalesce(b.phone,'')),'') IS NOT NULL AND nullif(btrim(coalesce(b.email,'')),'') IS NOT NULL AND nullif(btrim(coalesce(b.address,'')),'') IS NOT NULL)::integer
      +(b.logo_path IS NOT NULL)::integer
      +(EXISTS(SELECT 1 FROM public.business_subscriptions s WHERE s.business_id=b.id AND s.status IN ('trial','active') AND current_date>=s.starts_on AND (s.ends_on IS NULL OR current_date<=s.ends_on)))::integer
      +(cardinality(b.enabled_modules)>0)::integer
      +(EXISTS(SELECT 1 FROM public.branches br WHERE br.business_id=b.id AND br.is_main AND br.active))::integer
      +(EXISTS(SELECT 1 FROM public.profiles p WHERE p.business_id=b.id AND p.role='admin' AND p.active AND NOT EXISTS(SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=p.id)))::integer)::integer AS completed,
    6,
    (b.active
      AND nullif(btrim(coalesce(b.phone,'')),'') IS NOT NULL
      AND nullif(btrim(coalesce(b.email,'')),'') IS NOT NULL
      AND nullif(btrim(coalesce(b.address,'')),'') IS NOT NULL
      AND b.logo_path IS NOT NULL AND cardinality(b.enabled_modules)>0
      AND EXISTS(SELECT 1 FROM public.business_subscriptions s WHERE s.business_id=b.id AND s.status IN ('trial','active') AND current_date>=s.starts_on AND (s.ends_on IS NULL OR current_date<=s.ends_on))
      AND EXISTS(SELECT 1 FROM public.branches br WHERE br.business_id=b.id AND br.is_main AND br.active)
      AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.business_id=b.id AND p.role='admin' AND p.active AND NOT EXISTS(SELECT 1 FROM public.platform_admins pa WHERE pa.user_id=p.id))) AS ready
  FROM public.businesses b ORDER BY b.created_at DESC,b.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_business_readiness(uuid),public.platform_readiness_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_business_readiness(uuid),public.platform_readiness_overview() TO authenticated;

COMMIT;
