BEGIN;

ALTER TABLE public.businesses
  ADD COLUMN logo_path text,
  ADD COLUMN primary_color text NOT NULL DEFAULT '#1d4ed8',
  ADD COLUMN accent_color text NOT NULL DEFAULT '#2563eb',
  ADD CONSTRAINT business_primary_hex CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  ADD CONSTRAINT business_accent_hex CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$');

-- Business administrators can still update ordinary contact settings,
-- but lifecycle, code and platform branding are platform-controlled.
REVOKE UPDATE ON public.businesses FROM authenticated;
GRANT UPDATE (name, phone, email, address, currency_code, timezone)
  ON public.businesses TO authenticated;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT p.business_id INTO v_id
  FROM public.profiles p JOIN public.businesses b ON b.id = p.business_id
  WHERE p.id = auth.uid() AND p.active IS TRUE AND b.active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active staff and business required' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_role public.user_role;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles p JOIN public.businesses b ON b.id = p.business_id
  WHERE p.id = auth.uid() AND p.active IS TRUE AND b.active IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active staff and business required' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

CREATE FUNCTION public.platform_get_business(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'id', b.id, 'name', b.name, 'code', b.code, 'phone', b.phone,
    'email', b.email, 'address', b.address, 'active', b.active,
    'currency_code', b.currency_code, 'timezone', b.timezone,
    'logo_path', b.logo_path, 'primary_color', b.primary_color,
    'accent_color', b.accent_color, 'updated_at', b.updated_at
  ) INTO result FROM public.businesses b WHERE b.id = p_id;
  RETURN result;
END;
$$;

CREATE FUNCTION public.platform_update_business(
  p_id uuid, p_expected_updated_at timestamptz,
  p_name text, p_phone text, p_email text, p_address text,
  p_primary_color text, p_accent_color text, p_active boolean
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120
     OR length(coalesce(p_phone,'')) > 30 OR length(coalesce(p_email,'')) > 254
     OR length(coalesce(p_address,'')) > 500 OR p_active IS NULL
     OR p_primary_color IS NULL OR p_primary_color !~ '^#[0-9a-fA-F]{6}$'
     OR p_accent_color IS NULL OR p_accent_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Invalid business details' USING ERRCODE = '22023';
  END IF;
  UPDATE public.businesses SET
    name = btrim(p_name), phone = nullif(btrim(p_phone),''),
    email = nullif(btrim(p_email),''), address = nullif(btrim(p_address),''),
    primary_color = lower(p_primary_color), accent_color = lower(p_accent_color),
    active = p_active
  WHERE id = p_id AND updated_at = p_expected_updated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business changed; reload before saving' USING ERRCODE = '40001';
  END IF;
END;
$$;

-- Logos are public brand assets. No customer documents belong in this bucket.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('infoaxon-business-logos', 'infoaxon-business-logos', true, 524288, ARRAY['image/webp']);

-- Even if other buckets have broad grants, writes to this bucket stay server-only.
CREATE POLICY business_logos_server_only ON storage.objects
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'infoaxon-business-logos')
WITH CHECK (bucket_id <> 'infoaxon-business-logos');

CREATE FUNCTION public.platform_set_business_logo(
  p_id uuid, p_expected_updated_at timestamptz, p_logo_path text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Platform access required' USING ERRCODE = '42501';
  END IF;
  IF p_logo_path IS NOT NULL THEN
    IF p_logo_path !~ ('^' || p_id::text || '/[0-9a-f-]{36}[.]webp$')
      OR NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'infoaxon-business-logos' AND name = p_logo_path
      ) THEN
      RAISE EXCEPTION 'Invalid logo path' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.businesses SET logo_path = p_logo_path
  WHERE id = p_id AND updated_at = p_expected_updated_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business changed; reload before saving' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE FUNCTION public.my_business_branding()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', b.id, 'name', b.name, 'code', b.code, 'logo_path', b.logo_path,
    'primary_color', b.primary_color, 'accent_color', b.accent_color,
    'timezone', b.timezone, 'full_name', p.full_name, 'role', p.role,
    'branch_name', br.name
  )
  FROM public.profiles p JOIN public.businesses b ON b.id = p.business_id
  LEFT JOIN public.branches br ON br.id = p.branch_id AND br.business_id = b.id
  WHERE p.id = auth.uid() AND p.active IS TRUE AND b.active IS TRUE
    AND public.is_platform_admin() IS NOT TRUE;
$$;

REVOKE ALL ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_get_business(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_update_business(uuid,timestamptz,text,text,text,text,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_business_logo(uuid,timestamptz,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_business_branding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_business_id(), public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_get_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_update_business(uuid,timestamptz,text,text,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_business_logo(uuid,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_business_branding() TO authenticated;

COMMIT;
