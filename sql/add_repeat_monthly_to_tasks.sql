-- Run this in Supabase SQL Editor to support Repeat Monthly toggle for Daily Tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_monthly BOOLEAN DEFAULT false;
