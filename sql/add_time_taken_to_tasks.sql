-- ==========================================================
-- Add Time Taken column to tasks table
-- Run this in your Supabase Project -> SQL Editor -> Run
-- ==========================================================

-- 1. Add time_taken column if it doesn't already exist
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS time_taken TEXT DEFAULT NULL;

-- 2. Force PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';

-- 3. Explicitly grant permissions according to Supabase Data API rules (May 2026 Update)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated, service_role;
