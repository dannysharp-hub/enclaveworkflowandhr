CREATE POLICY "Engineers+ can delete tenant jobs"
ON public.jobs
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'engineer'::app_role)
    OR public.has_role(auth.uid(), 'supervisor'::app_role)
  )
);