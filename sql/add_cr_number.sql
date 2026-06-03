-- ============================================
-- Add CR Number column to companies table
-- Run this in Supabase SQL Editor
-- ============================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cr_number TEXT;

-- Grant access via Supabase Data API (required since May 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO anon, authenticated;
