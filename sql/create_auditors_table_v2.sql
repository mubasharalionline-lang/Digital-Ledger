-- Create auditors table
CREATE TABLE IF NOT EXISTS auditors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add auditor_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auditor_id UUID REFERENCES auditors(id) ON DELETE SET NULL;

-- Enable RLS and Allow all operations (Matching project pattern)
ALTER TABLE auditors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all auditors" ON auditors;
CREATE POLICY "Allow all auditors" ON auditors
  FOR ALL USING (true) WITH CHECK (true);

-- Ensure permissions for the API
GRANT ALL ON TABLE auditors TO anon, authenticated, service_role;

-- Reload schema
NOTIFY pgrst, 'reload schema';
