-- 1. Fix the RLS policy for 'countries' so we can create new countries
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to countries" ON countries;
CREATE POLICY "Allow all access to countries" ON countries FOR ALL USING (true) WITH CHECK (true);

-- 2. Ensure 'task_types' has a country column for data isolation
ALTER TABLE task_types ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Bahrain';

-- 3. Update existing task types to belong to Bahrain (since they are live running data)
UPDATE task_types SET country = 'Bahrain' WHERE country IS NULL;

-- 4. Just in case statuses needs RLS fix too
ALTER TABLE statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to statuses" ON statuses;
CREATE POLICY "Allow all access to statuses" ON statuses FOR ALL USING (true) WITH CHECK (true);

-- 5. Fix RLS policy for 'task_types' just to be safe
ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to task_types" ON task_types;
CREATE POLICY "Allow all access to task_types" ON task_types FOR ALL USING (true) WITH CHECK (true);
