BEGIN;

CREATE TABLE public.platform_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[a-z_]+[.][a-z_]+$'),
  entity_type text NOT NULL CHECK (entity_type IN ('business','subscription','branch','staff','client_admin')),
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX platform_audit_business_time_idx ON public.platform_audit_log(business_id,occurred_at DESC,id DESC);
CREATE INDEX platform_audit_action_time_idx ON public.platform_audit_log(action,occurred_at DESC,id DESC);
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_audit_log FROM PUBLIC,anon,authenticated;

-- Retain the client administrator events captured by migration 021.
INSERT INTO public.platform_audit_log(business_id,actor_id,action,entity_type,entity_id,new_values,occurred_at)
SELECT e.business_id,e.actor_id,'client_admin.'||e.event,'client_admin',e.target_id,
  jsonb_build_object('event',e.event),e.created_at
FROM public.platform_admin_events e;

CREATE FUNCTION public.capture_platform_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_action text; v_entity text; v_business uuid; v_entity_id uuid; v_old jsonb; v_new jsonb;
BEGIN
  IF TG_TABLE_NAME='businesses' THEN
    v_business:=NEW.id;v_entity_id:=NEW.id;v_entity:='business';
    IF TG_OP='INSERT' THEN v_action:='business.created';
    ELSIF NEW.enabled_modules IS DISTINCT FROM OLD.enabled_modules THEN v_action:='business.modules_updated';
    ELSE v_action:='business.updated'; END IF;
    IF TG_OP='UPDATE' THEN
      v_old:=jsonb_build_object('name',OLD.name,'code',OLD.code,'active',OLD.active,'phone',OLD.phone,'email',OLD.email,'address',OLD.address,'currency_code',OLD.currency_code,'timezone',OLD.timezone,'logo_path',OLD.logo_path,'primary_color',OLD.primary_color,'accent_color',OLD.accent_color,'enabled_modules',OLD.enabled_modules);
    END IF;
    v_new:=jsonb_build_object('name',NEW.name,'code',NEW.code,'active',NEW.active,'phone',NEW.phone,'email',NEW.email,'address',NEW.address,'currency_code',NEW.currency_code,'timezone',NEW.timezone,'logo_path',NEW.logo_path,'primary_color',NEW.primary_color,'accent_color',NEW.accent_color,'enabled_modules',NEW.enabled_modules);
  ELSIF TG_TABLE_NAME='business_subscriptions' THEN
    v_business:=NEW.business_id;v_entity_id:=NEW.business_id;v_entity:='subscription';v_action:='subscription.updated';
    IF TG_OP='UPDATE' THEN v_old:=jsonb_build_object('plan',OLD.plan,'status',OLD.status,'starts_on',OLD.starts_on,'ends_on',OLD.ends_on,'monthly_fee',OLD.monthly_fee,'additional_module_fee',OLD.additional_module_fee,'notes',OLD.notes); END IF;
    v_new:=jsonb_build_object('plan',NEW.plan,'status',NEW.status,'starts_on',NEW.starts_on,'ends_on',NEW.ends_on,'monthly_fee',NEW.monthly_fee,'additional_module_fee',NEW.additional_module_fee,'notes',NEW.notes);
  ELSIF TG_TABLE_NAME='branches' THEN
    v_business:=NEW.business_id;v_entity_id:=NEW.id;v_entity:='branch';v_action:=CASE WHEN TG_OP='INSERT' THEN 'branch.created' ELSE 'branch.updated' END;
    IF TG_OP='UPDATE' THEN v_old:=jsonb_build_object('name',OLD.name,'code',OLD.code,'phone',OLD.phone,'address',OLD.address,'active',OLD.active,'is_main',OLD.is_main); END IF;
    v_new:=jsonb_build_object('name',NEW.name,'code',NEW.code,'phone',NEW.phone,'address',NEW.address,'active',NEW.active,'is_main',NEW.is_main);
  ELSE
    v_business:=NEW.business_id;v_entity_id:=NEW.id;
    v_entity:=CASE WHEN NEW.role='admin' THEN 'client_admin' ELSE 'staff' END;
    v_action:=v_entity||'.updated';
    v_old:=jsonb_build_object('full_name',OLD.full_name,'role',OLD.role,'branch_id',OLD.branch_id,'phone',OLD.phone,'active',OLD.active);
    v_new:=jsonb_build_object('full_name',NEW.full_name,'role',NEW.role,'branch_id',NEW.branch_id,'phone',NEW.phone,'active',NEW.active);
  END IF;
  IF TG_OP='INSERT' OR v_old IS DISTINCT FROM v_new THEN
    INSERT INTO public.platform_audit_log(business_id,actor_id,action,entity_type,entity_id,old_values,new_values)
    VALUES(v_business,auth.uid(),v_action,v_entity,v_entity_id,v_old,v_new);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_platform_audit() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER businesses_platform_audit AFTER INSERT OR UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.capture_platform_audit();
CREATE TRIGGER subscriptions_platform_audit AFTER INSERT OR UPDATE ON public.business_subscriptions FOR EACH ROW EXECUTE FUNCTION public.capture_platform_audit();
CREATE TRIGGER branches_platform_audit AFTER INSERT OR UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.capture_platform_audit();
CREATE TRIGGER profiles_platform_audit AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.capture_platform_audit();

CREATE FUNCTION public.platform_list_audit_log(
  p_business uuid DEFAULT NULL,p_action text DEFAULT NULL,p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,p_offset integer DEFAULT 0,p_limit integer DEFAULT 50
) RETURNS TABLE(id bigint,business_id uuid,business_name text,actor_id uuid,actor_email text,
  action text,entity_type text,entity_id uuid,old_values jsonb,new_values jsonb,occurred_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required' USING ERRCODE='42501';
  END IF;
  IF p_offset<0 OR p_limit<1 OR p_limit>100 OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_to<p_from) THEN
    RAISE EXCEPTION 'Invalid audit filters' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT a.id,a.business_id,b.name,u.id,u.email::text,a.action,a.entity_type,a.entity_id,
    a.old_values,a.new_values,a.occurred_at
  FROM public.platform_audit_log a
  LEFT JOIN public.businesses b ON b.id=a.business_id
  LEFT JOIN auth.users u ON u.id=a.actor_id
  WHERE (p_business IS NULL OR a.business_id=p_business)
    AND (p_action IS NULL OR a.action=p_action)
    AND (p_from IS NULL OR a.occurred_at>=p_from)
    AND (p_to IS NULL OR a.occurred_at<=p_to)
  ORDER BY a.occurred_at DESC,a.id DESC OFFSET p_offset LIMIT p_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_list_audit_log(uuid,text,timestamptz,timestamptz,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_list_audit_log(uuid,text,timestamptz,timestamptz,integer,integer) TO authenticated;

COMMIT;
