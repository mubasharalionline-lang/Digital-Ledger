-- Run this in Supabase SQL Editor to support Daily Tasks
-- This drops the NOT NULL constraint on company_id and adds an is_daily flag.

ALTER TABLE tasks ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_daily BOOLEAN DEFAULT false;
