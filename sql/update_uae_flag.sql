-- Update the UAE country record to use the correct UAE flag
-- Run this in your Supabase SQL Editor

UPDATE countries 
SET flag = '🇦🇪' 
WHERE name ILIKE '%UAE%' OR code ILIKE '%UAE%';
