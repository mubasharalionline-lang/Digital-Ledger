-- Add the assigned_partners JSONB array to support multiple task assignees
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_partners JSONB DEFAULT '[]'::jsonb;

-- Force API schema reload
NOTIFY pgrst, reload_schema;
