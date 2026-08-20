-- ==========================================================
-- Add PL Date (Proposal Letter Date) column to tasks table
-- Run this in your Supabase Project -> SQL Editor -> Run
-- ==========================================================

-- 1. Add pl_date column if it doesn't already exist
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS pl_date DATE;

-- 2. Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';

-- 3. Explicitly grant permissions according to Supabase Data API rules
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated, service_role;
