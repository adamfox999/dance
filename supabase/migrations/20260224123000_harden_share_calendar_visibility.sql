BEGIN;

-- Reduce accidental oversharing for routine-share recipients.
-- Keep owner and guardian visibility unchanged.

DROP POLICY IF EXISTS event_select ON public.event;
CREATE POLICY event_select ON public.event
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND public.event_visible_to_guardian(id, owner_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.event_entry ee
    WHERE ee.event_id = event.id
      AND ee.owner_id = event.owner_id
      AND ee.routine_id IS NOT NULL
      AND public.is_share_recipient_for_routine(event.owner_id, ee.routine_id)
  )
);

DROP POLICY IF EXISTS event_entry_select ON public.event_entry;
CREATE POLICY event_entry_select ON public.event_entry
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
  OR (
    routine_id IS NOT NULL
    AND public.is_share_recipient_for_routine(owner_id, routine_id)
  )
);

DROP POLICY IF EXISTS scrapbook_entry_select ON public.scrapbook_entry;
CREATE POLICY scrapbook_entry_select ON public.scrapbook_entry
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND public.event_visible_to_guardian(event_id, owner_id)
  )
  OR EXISTS (
    SELECT 1
    FROM public.event_entry ee
    WHERE ee.event_id = scrapbook_entry.event_id
      AND ee.owner_id = scrapbook_entry.owner_id
      AND ee.routine_id IS NOT NULL
      AND public.is_share_recipient_for_routine(scrapbook_entry.owner_id, ee.routine_id)
  )
);

COMMIT;
