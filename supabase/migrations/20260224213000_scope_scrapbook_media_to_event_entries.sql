BEGIN;

ALTER TABLE public.scrapbook_entry
  ADD COLUMN IF NOT EXISTS event_entry_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scrapbook_entry_event_entry_id_fkey'
  ) THEN
    ALTER TABLE public.scrapbook_entry
      ADD CONSTRAINT scrapbook_entry_event_entry_id_fkey
      FOREIGN KEY (event_entry_id)
      REFERENCES public.event_entry(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_scrapbook_entry_event_entry_id
  ON public.scrapbook_entry(event_entry_id);

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

DROP POLICY IF EXISTS scrapbook_entry_select ON public.scrapbook_entry;
CREATE POLICY scrapbook_entry_select ON public.scrapbook_entry
FOR SELECT TO public
USING (
  owner_id = (SELECT auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND public.event_visible_to_guardian(event_id, owner_id)
  )
  OR (
    event_entry_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.event_entry ee
      WHERE ee.id = scrapbook_entry.event_entry_id
        AND ee.owner_id = scrapbook_entry.owner_id
        AND ee.routine_id IS NOT NULL
        AND public.is_share_recipient_for_routine(scrapbook_entry.owner_id, ee.routine_id)
    )
  )
  OR (
    event_entry_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.event_entry ee
      WHERE ee.event_id = scrapbook_entry.event_id
        AND ee.owner_id = scrapbook_entry.owner_id
        AND ee.routine_id IS NOT NULL
        AND public.is_share_recipient_for_routine(scrapbook_entry.owner_id, ee.routine_id)
    )
  )
);

COMMIT;
