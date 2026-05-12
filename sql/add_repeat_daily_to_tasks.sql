-- Run this in Supabase SQL Editor to support Repeat Daily toggle for Daily Tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_daily BOOLEAN DEFAULT false;
