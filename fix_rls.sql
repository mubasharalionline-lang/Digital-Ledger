-- Run this in your Supabase SQL Editor to fix the Row Level Security (RLS) policies 
-- that are silently blocking task updates and deletions for the Bahrain app.

-- 1. Ensure RLS is enabled for tasks and status_log
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_log ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing policies that might be restricting access
DROP POLICY IF EXISTS "Allow all access to tasks" ON tasks;
DROP POLICY IF EXISTS "Allow all access to status_log" ON status_log;

-- 3. Create permissive policies for all operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Allow all access to tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to status_log" ON status_log FOR ALL USING (true) WITH CHECK (true);

-- 4. Ensure Cascade Delete is setup on status_log to allow deleting tasks cleanly
ALTER TABLE status_log
DROP CONSTRAINT IF EXISTS status_log_task_id_fkey,
ADD CONSTRAINT status_log_task_id_fkey 
  FOREIGN KEY (task_id) 
  REFERENCES tasks(id) 
  ON DELETE CASCADE;
