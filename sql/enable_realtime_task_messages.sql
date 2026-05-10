-- Enable realtime for task_messages table so users receive instant popup notifications
-- Run this in your Supabase SQL Editor

-- 1. Ensure the table exists
CREATE TABLE IF NOT EXISTS task_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add the table to the supabase_realtime publication
-- We use a DO block to safely add it without causing an error if it's already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_messages;
  END IF;
END $$;
