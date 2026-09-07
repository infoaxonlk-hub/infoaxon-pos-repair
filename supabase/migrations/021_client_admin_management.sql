BEGIN;

CREATE TABLE public.platform_admin_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL,
 target_id uuid NOT NULL,
 business_id uuid NOT NULL,
 event text NOT NULL CHECK(event IN ('activated','deactivated','reset_requested')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.platform_admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_events FROM PUBLIC,anon,authenticated;
CREATE INDEX ON public.platform_admin_events(target_id,created_at DESC);

CREATE FUNCTION public.platform_list_client_admins(p_business uuid)
RETURNS TABLE(id uuid,full_name text,email text,active boolean,updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.id,p.full_name,u.email::text,p.active,p.updated_at
 FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.business_id=p_business AND p.role='admin'
 AND NOT EXISTS(SELECT 1 FROM public.platform_admins a WHERE a.user_id=p.id)
 ORDER BY p.full_name,p.id;
END;
$$;

CREATE FUNCTION public.platform_set_client_admin_active(p_business uuid,p_target uuid,p_expected timestamptz,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_profile public.profiles;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_active IS NULL OR p_expected IS NULL OR p_target=auth.uid() THEN RAISE EXCEPTION 'Invalid change' USING ERRCODE='22023'; END IF;
 -- Serialize removals before locking profiles; preserve existing last-admin trigger.
 PERFORM 1 FROM public.businesses WHERE id=p_business FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_profile FROM public.profiles WHERE id=p_target AND business_id=p_business AND role='admin' FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=p_target) THEN RAISE EXCEPTION 'Admin unavailable' USING ERRCODE='42501'; END IF;
 IF v_profile.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Refresh before saving' USING ERRCODE='40001'; END IF;
 IF v_profile.active=p_active THEN RETURN; END IF;
 UPDATE public.profiles SET active=p_active WHERE id=p_target;
 INSERT INTO public.platform_admin_events(actor_id,target_id,business_id,event)
 VALUES(auth.uid(),p_target,p_business,CASE WHEN p_active THEN 'activated' ELSE 'deactivated' END);
END;
$$;

CREATE FUNCTION public.platform_request_client_admin_reset(p_business uuid,p_target uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_email text;
BEGIN
 IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_target AND business_id=p_business AND role='admin' AND active FOR UPDATE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=p_target)
 OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=p_business AND active)
 THEN RAISE EXCEPTION 'Active client admin required' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_admin_events WHERE target_id=p_target AND event='reset_requested' AND created_at>clock_timestamp()-interval '60 seconds')
 THEN RAISE EXCEPTION 'Wait before retrying' USING ERRCODE='P0001'; END IF;
 SELECT email INTO v_email FROM auth.users WHERE id=p_target;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Email unavailable' USING ERRCODE='22023'; END IF;
 INSERT INTO public.platform_admin_events(actor_id,target_id,business_id,event) VALUES(auth.uid(),p_target,p_business,'reset_requested');
 RETURN v_email;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_list_client_admins(uuid),public.platform_set_client_admin_active(uuid,uuid,timestamptz,boolean),public.platform_request_client_admin_reset(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_client_admins(uuid),public.platform_set_client_admin_active(uuid,uuid,timestamptz,boolean),public.platform_request_client_admin_reset(uuid,uuid) TO authenticated;
COMMIT;
