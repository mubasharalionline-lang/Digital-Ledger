-- ============================================================
-- SAFE STATUS ↔ TASK TYPE LINKING MIGRATION
-- Based on actual usage in the tasks table
-- ============================================================
-- This script will NOT break any existing data:
--   • It only updates statuses that have NULL task_type_ids (not yet linked)
--   • It reads actual task data to determine which task types each status is used with
--   • Statuses not found in any task remain NULL (universal / shown for all types)
-- ============================================================

-- ========================
-- STEP 1: PREVIEW (Read-Only)
-- Run this FIRST to see what will be linked
-- ========================

-- Show current statuses and their planned linkage
WITH task_type_usage AS (
  -- Unnest task_type_ids array from tasks
  SELECT 
    t.status,
    unnest(
      CASE 
        WHEN t.task_type_ids IS NOT NULL AND array_length(t.task_type_ids, 1) > 0 
        THEN t.task_type_ids
        WHEN t.task_type_id IS NOT NULL AND t.task_type_id != ''
        THEN string_to_array(t.task_type_id, ',')
        ELSE ARRAY[]::TEXT[]
      END
    ) as tt_id
  FROM tasks t
  WHERE t.status IS NOT NULL 
    AND t.is_daily IS NOT TRUE
),
aggregated AS (
  SELECT 
    status,
    array_agg(DISTINCT trim(tt_id)) as linked_task_type_ids,
    count(DISTINCT trim(tt_id)) as type_count
  FROM task_type_usage
  WHERE tt_id IS NOT NULL AND trim(tt_id) != ''
  GROUP BY status
)
SELECT 
  s.id,
  s.name as status_name,
  s.country,
  s.active,
  s.task_type_ids as current_linkage,
  a.linked_task_type_ids as will_be_linked_to,
  a.type_count,
  (SELECT array_agg(tt.name) FROM task_types tt WHERE tt.id = ANY(a.linked_task_type_ids)) as task_type_names
FROM statuses s
LEFT JOIN aggregated a ON s.name = a.status
ORDER BY s.country, s.name;


-- ========================
-- STEP 2: APPLY LINKAGE
-- Run this AFTER reviewing Step 1
-- ========================

WITH task_type_usage AS (
  SELECT 
    t.status,
    t.country,
    unnest(
      CASE 
        WHEN t.task_type_ids IS NOT NULL AND array_length(t.task_type_ids, 1) > 0 
        THEN t.task_type_ids
        WHEN t.task_type_id IS NOT NULL AND t.task_type_id != ''
        THEN string_to_array(t.task_type_id, ',')
        ELSE ARRAY[]::TEXT[]
      END
    ) as tt_id
  FROM tasks t
  WHERE t.status IS NOT NULL 
    AND t.is_daily IS NOT TRUE
),
aggregated AS (
  SELECT 
    status,
    country,
    array_agg(DISTINCT trim(tt_id)) as linked_task_type_ids
  FROM task_type_usage
  WHERE tt_id IS NOT NULL AND trim(tt_id) != ''
  GROUP BY status, country
)
UPDATE statuses s
SET task_type_ids = a.linked_task_type_ids
FROM aggregated a
WHERE s.name = a.status
  AND (s.country = a.country OR (s.country IS NULL AND a.country IS NULL))
  AND s.task_type_ids IS NULL;  -- SAFETY: Only update statuses not already manually linked


-- ========================
-- STEP 3: VERIFY
-- Check the result after applying
-- ========================

SELECT 
  s.name as status_name,
  s.country,
  s.active,
  s.task_type_ids,
  (SELECT array_agg(tt.name) FROM task_types tt WHERE tt.id = ANY(COALESCE(s.task_type_ids, ARRAY[]::TEXT[]))) as task_type_names,
  CASE 
    WHEN s.task_type_ids IS NULL THEN '✅ Universal (all types)'
    ELSE '🔗 Linked to ' || array_length(s.task_type_ids, 1) || ' type(s)'
  END as linkage_status
FROM statuses s
ORDER BY s.country, s.name;
