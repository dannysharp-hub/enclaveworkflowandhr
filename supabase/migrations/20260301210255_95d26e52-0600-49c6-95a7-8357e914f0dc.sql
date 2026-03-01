
DROP POLICY "Service can insert notifications" ON public.notifications;
CREATE POLICY "Supervisors can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'supervisor') OR 
    has_role(auth.uid(), 'engineer')
  );
