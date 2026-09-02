BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_staff_safety()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  removes_admin boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id THEN
      RAISE EXCEPTION 'Staff identity and business cannot be changed'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    NEW.full_name := btrim(NEW.full_name);
    NEW.phone := nullif(btrim(NEW.phone), '');

    IF NEW.full_name IS NULL
       OR char_length(NEW.full_name) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'Staff name must contain 1-120 characters'
        USING ERRCODE = '23514';
    END IF;

    IF char_length(NEW.phone) > 30
       OR NEW.active IS NULL
       OR NEW.role IS NULL THEN
      RAISE EXCEPTION 'Invalid staff details'
        USING ERRCODE = '23514';
    END IF;

    -- New branch assignments must belong to this business
    -- and reference an active branch.
    IF NEW.branch_id IS NOT NULL THEN
      IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.branches
          WHERE id = NEW.branch_id
            AND business_id = NEW.business_id
            AND active IS TRUE
        ) THEN
          RAISE EXCEPTION 'Select an active branch in this business'
            USING ERRCODE = '23514';
        END IF;

      ELSIF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
        IF NOT EXISTS (
          SELECT 1
          FROM public.branches
          WHERE id = NEW.branch_id
            AND business_id = NEW.business_id
            AND active IS TRUE
        ) THEN
          RAISE EXCEPTION 'Select an active branch in this business'
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    removes_admin :=
      OLD.active IS TRUE
      AND OLD.role = 'admin';
  ELSE
    removes_admin :=
      OLD.active IS TRUE
      AND OLD.role = 'admin'
      AND (
        NEW.active IS NOT TRUE
        OR NEW.role IS DISTINCT FROM 'admin'::public.user_role
      );
  END IF;

  IF removes_admin THEN
    -- Serialize admin removals within the same business.
    UPDATE public.businesses
    SET updated_at = clock_timestamp()
    WHERE id = OLD.business_id;

    IF NOT FOUND THEN
      -- Allow a deliberate whole-business deletion to cascade.
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RAISE EXCEPTION 'Business was not found'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE business_id = OLD.business_id
        AND id <> OLD.id
        AND active IS TRUE
        AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Keep at least one active administrator in this business'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot remove your own administrator access'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL
ON FUNCTION public.enforce_staff_safety()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_staff_safety
BEFORE INSERT OR UPDATE OR DELETE
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_staff_safety();

COMMIT;