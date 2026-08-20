-- Add pl_date column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS pl_date DATE;

-- Populate existing tasks pl_date from created_at where pl_uploaded is true (optional best effort)
-- UPDATE tasks SET pl_date = created_at::date WHERE pl_uploaded = true AND pl_date IS NULL;

-- Ensure explicit permissions according to Supabase policy rules
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated;
