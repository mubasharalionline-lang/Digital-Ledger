-- ============================================
-- Add CR Link column to companies table
-- Run this in Supabase SQL Editor
-- ============================================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS cr_link TEXT;

-- Grant access via Supabase Data API (required since May 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO anon, authenticated;
