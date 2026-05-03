-- Run this in your Supabase SQL Editor to add the missing permissions column
-- and refresh the API schema cache.

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS permissions JSONB 
DEFAULT '{"can_update_status": true, "can_view_companies": false, "can_send_messages": false}'::jsonb;

-- This forces Supabase's API to immediately recognize the new column
NOTIFY pgrst, reload_schema;
