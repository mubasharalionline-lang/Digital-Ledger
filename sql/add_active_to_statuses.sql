-- Add active column to statuses table
-- Run this in Supabase SQL Editor

ALTER TABLE public.statuses ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;

-- Set all existing statuses to active
UPDATE public.statuses SET active = true WHERE active IS NULL;
