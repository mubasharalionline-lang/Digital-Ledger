-- Create task_messages table for task-based conversations
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS task_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by task
CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON task_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_created_at ON task_messages(task_id, created_at);

-- Disable RLS (matching existing pattern in the project)
ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY;

-- Allow all operations (matching existing project RLS pattern)
CREATE POLICY "Allow all task_messages" ON task_messages
  FOR ALL USING (true) WITH CHECK (true);
