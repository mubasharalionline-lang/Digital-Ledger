-- ============================================================================
-- Migration: Add completed_at timestamp to tasks table
-- ============================================================================

-- 1. Add completed_at column to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Backfill completed_at for already completed tasks using existing status_log if available
UPDATE public.tasks t
SET completed_at = COALESCE(
  (
    SELECT sl.created_at
    FROM public.status_log sl
    WHERE sl.task_id = t.id
      AND LOWER(sl.status) IN ('completed', 'complete', 'closed', 'filed', 'done')
    ORDER BY sl.created_at DESC
    LIMIT 1
  ),
  t.created_at
)
WHERE LOWER(t.status) IN ('completed', 'complete', 'closed', 'filed', 'done')
  AND t.completed_at IS NULL;

-- 3. Supabase Data API Access Grant
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon, authenticated;
