-- Countries table: stores available countries for the unified system
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS countries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  flag TEXT DEFAULT '🌍',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default countries (won't fail if they already exist)
INSERT INTO countries (code, name, flag)
VALUES 
  ('BH', 'Bahrain', '🇧🇭'),
  ('NZ', 'New Zealand', '🇳🇿')
ON CONFLICT (code) DO NOTHING;

-- Allow all authenticated users to read countries
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read countries" 
  ON countries FOR SELECT 
  USING (true);

CREATE POLICY IF NOT EXISTS "Admins can insert countries" 
  ON countries FOR INSERT 
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Admins can update countries" 
  ON countries FOR UPDATE 
  USING (true);
