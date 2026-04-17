-- Grant super_admin to Danny (in addition to existing admin role)
INSERT INTO public.user_roles (user_id, role, tenant_id)
VALUES ('b214ed81-d336-41d2-86df-0f4e3c3575bc', 'super_admin', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role) DO NOTHING;

-- Helper: is the current user a super_admin?
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Drop the old "admins can manage roles" policy
DROP POLICY IF EXISTS "Admins can manage tenant roles" ON public.user_roles;

-- Read: anyone in the tenant can view roles (unchanged behaviour for read)
-- The existing "Users can view tenant roles" SELECT policy remains.

-- Write: only super_admins can insert/update/delete role rows
CREATE POLICY "Super admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));