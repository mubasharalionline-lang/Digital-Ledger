-- Run this SQL in your Supabase SQL Editor to add the message/notes field to the tasks table

ALTER TABLE public.tasks ADD COLUMN admin_note TEXT;
