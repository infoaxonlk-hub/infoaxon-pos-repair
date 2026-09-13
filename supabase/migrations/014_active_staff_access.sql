BEGIN;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT p.business_id
  INTO v_business_id
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active staff account required'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_business_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role public.user_role;
BEGIN
  SELECT p.role
  INTO v_role
  FROM public.profiles AS p
  WHERE p.id = auth.uid()
    AND p.active IS TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active staff account required'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_role;
END;
$function$;

REVOKE ALL ON FUNCTION public.current_business_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_business_id()
TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_user_role()
TO authenticated;

COMMIT;