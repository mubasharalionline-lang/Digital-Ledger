-- Run this in Supabase SQL Editor to add the country column to tasks
-- This is needed for daily tasks which are not linked to a company
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS country TEXT;

-- Backfill existing tasks with their company's country
UPDATE tasks t
SET country = c.country
FROM companies c
WHERE t.company_id = c.id AND t.country IS NULL;

-- Default any remaining tasks without a country to 'Bahrain'
UPDATE tasks SET country = 'Bahrain' WHERE country IS NULL;
