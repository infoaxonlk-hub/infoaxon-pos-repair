BEGIN;

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins
  ENABLE ROW LEVEL SECURITY;

-- App users cannot grant themselves platform access.
REVOKE ALL ON TABLE public.platform_admins
  FROM PUBLIC, anon, authenticated;

-- A signed-in user may only read their own membership.
GRANT SELECT ON TABLE public.platform_admins
  TO authenticated;

CREATE POLICY platform_admins_read_self
ON public.platform_admins
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = (SELECT auth.uid())
      AND active IS TRUE
  );
$function$;

REVOKE ALL ON FUNCTION public.is_platform_admin()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_platform_admin()
  TO authenticated;

COMMIT;