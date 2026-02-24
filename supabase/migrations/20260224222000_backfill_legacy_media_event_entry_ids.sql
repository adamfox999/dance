BEGIN;

WITH legacy_media AS (
  SELECT
    se.id AS scrapbook_id,
    (
      SELECT ee.id
      FROM public.event_entry ee
      WHERE ee.event_id = se.event_id
      ORDER BY
        (ee.scheduled_date IS NULL),
        ee.scheduled_date,
        NULLIF(ee.scheduled_time, '') NULLS LAST,
        ee.created_at,
        ee.id
      LIMIT 1
    ) AS resolved_event_entry_id
  FROM public.scrapbook_entry se
  WHERE se.event_entry_id IS NULL
    AND se.entry_type IN ('photo', 'video')
)
UPDATE public.scrapbook_entry se
SET event_entry_id = legacy_media.resolved_event_entry_id
FROM legacy_media
WHERE se.id = legacy_media.scrapbook_id
  AND legacy_media.resolved_event_entry_id IS NOT NULL;

COMMIT;
