-- Add ballpark_send to the action_type check constraint
ALTER TABLE cab_approval_requests
DROP CONSTRAINT IF EXISTS cab_approval_requests_action_type_check;

ALTER TABLE cab_approval_requests
ADD CONSTRAINT cab_approval_requests_action_type_check
CHECK (action_type IN ('job_edit', 'quote_send', 'design_signoff_send', 'invoice_send', 'ballpark_send'));