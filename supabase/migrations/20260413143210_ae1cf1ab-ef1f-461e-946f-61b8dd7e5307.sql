UPDATE cab_job_sequences 
SET next_number = 66 
WHERE company_id = (SELECT id FROM cab_companies LIMIT 1);