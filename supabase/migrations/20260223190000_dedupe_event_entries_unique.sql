BEGIN;

-- Clean up duplicate festival/competition entries for the same routine in the same event.
-- Keep the most complete/recent row and remove the rest.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY event_id, routine_id, owner_id
      ORDER BY
        (
          (CASE WHEN scheduled_date IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN NULLIF(scheduled_time, '') IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN place IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN qualified THEN 1 ELSE 0 END) +
          (CASE WHEN qualified_for_event_id IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN NULLIF(notes, '') IS NOT NULL THEN 1 ELSE 0 END)
        ) DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.event_entry
  WHERE routine_id IS NOT NULL
)
DELETE FROM public.event_entry ee
USING ranked r
WHERE ee.id = r.id
  AND r.rn > 1;

-- Prevent future duplicates at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_entry_event_routine_owner
  ON public.event_entry (event_id, routine_id, owner_id)
  WHERE routine_id IS NOT NULL;

COMMIT;
