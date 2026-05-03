-- ============================================
-- Bahrain Compliance Task Manager — Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Task Types table
CREATE TABLE IF NOT EXISTS task_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  jurisdiction TEXT NOT NULL DEFAULT 'All',
  status_options TEXT, -- comma-separated custom statuses
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Status Log table (task history timeline)
CREATE TABLE IF NOT EXISTS status_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add new columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type_id UUID REFERENCES task_types(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. Add new columns to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_registration TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fy_end TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS compliance_type TEXT;

-- 5. Add new columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS jurisdiction TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'Editor';

-- 6. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_status_log_task_id ON status_log(task_id);
CREATE INDEX IF NOT EXISTS idx_task_types_jurisdiction ON task_types(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_tasks_task_type_id ON tasks(task_type_id);

-- 7. RLS policies (public access like existing tables)
ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to task_types" ON task_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to status_log" ON status_log FOR ALL USING (true) WITH CHECK (true);

-- 8. Seed Bahrain Task Types
INSERT INTO task_types (name, category, jurisdiction, status_options, description, active) VALUES
  ('VAT Return - Bahrain', 'Tax Filing', 'Bahrain', 'Not Started,Data Collection,Computation,Review,Filed,Closed', 'Bahrain VAT return filing', true),
  ('Corporate Tax Return - Bahrain', 'Tax Filing', 'Bahrain', 'Not Started,Financial Statements,Tax Computation,Review,Filed,Closed', 'Bahrain Corporate Tax filing', true)
ON CONFLICT DO NOTHING;
