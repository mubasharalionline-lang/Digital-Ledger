-- Migration: Add task_type_ids array column to tasks table
-- This allows a single task to have multiple task types assigned

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type_ids TEXT[] DEFAULT '{}';

-- Backfill existing tasks: copy existing task_type_id into the new array
UPDATE tasks 
SET task_type_ids = ARRAY[task_type_id] 
WHERE task_type_id IS NOT NULL 
  AND (task_type_ids IS NULL OR task_type_ids = '{}');
