BEGIN;

CREATE FUNCTION public.platform_create_business(p_name text, p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(p_name);
  v_code text := upper(btrim(p_code));
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required'
      USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Invalid business name'
      USING ERRCODE = '22023';
  END IF;

  IF v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,29}$' THEN
    RAISE EXCEPTION 'Invalid business code'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_code, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE upper(b.code) = v_code
  ) THEN
    RAISE EXCEPTION 'Business code already exists'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.businesses(name, code)
  VALUES (v_name, v_code)
  RETURNING id INTO v_id;

  INSERT INTO public.branches(business_id, name, code)
  VALUES (v_id, 'Main Branch', 'MAIN');

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.platform_list_businesses()
RETURNS TABLE(id uuid, name text, code text, active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform administrator access required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT b.id, b.name, b.code, b.active
    FROM public.businesses b
    ORDER BY b.created_at DESC, b.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_business(text,text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.platform_list_businesses()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_create_business(text,text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.platform_list_businesses()
  TO authenticated;

COMMIT;