-- Create auditors table
CREATE TABLE IF NOT EXISTS auditors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add auditor_id to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auditor_id UUID REFERENCES auditors(id) ON DELETE SET NULL;

-- Reload schema
NOTIFY pgrst, 'reload schema';
