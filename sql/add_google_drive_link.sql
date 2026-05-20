-- Add optional Google Drive folder link to companies
-- This column stores a URL to the company's Google Drive folder
-- It is optional and does not affect existing data

ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_drive_link TEXT;
