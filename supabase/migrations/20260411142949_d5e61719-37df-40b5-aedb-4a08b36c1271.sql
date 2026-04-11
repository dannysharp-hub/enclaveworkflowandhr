CREATE POLICY "cab_appointments_delete"
ON public.cab_appointments
FOR DELETE
TO authenticated
USING (public.is_cab_company_member(company_id));