-- Allow the same username to exist in different countries
-- Run this in the Supabase SQL Editor

-- Step 1: Drop the existing unique constraint on username (if it exists)
-- The constraint name may vary — these cover common patterns
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_unique;

-- Also drop any unique index on username alone
DROP INDEX IF EXISTS users_username_key;
DROP INDEX IF EXISTS users_username_unique;
DROP INDEX IF EXISTS idx_users_username;

-- Step 2: Create a new composite unique constraint on (username, country)
-- This allows "john" in Bahrain AND "john" in New Zealand
ALTER TABLE users ADD CONSTRAINT users_username_country_unique UNIQUE (username, country);

-- Verify: list constraints on users table
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'users'::regclass;
