-- ============================================================
-- UAE COUNTRY WORKSPACE SCHEMA FIX
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Drop existing check constraint on country in users table and recreate it including 'UAE'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_country_check;
ALTER TABLE users ADD CONSTRAINT users_country_check CHECK (country IN ('New Zealand', 'Bahrain', 'UAE') OR country IS NULL);

-- 2. Seed default roles for UAE in roles table
INSERT INTO public.roles (name, country) VALUES
('Accountant', 'UAE'),
('Secretary', 'UAE'),
('Admin', 'UAE'),
('CA', 'UAE')
ON CONFLICT DO NOTHING;

-- 3. Notify schema reload
NOTIFY pgrst, 'reload schema';
