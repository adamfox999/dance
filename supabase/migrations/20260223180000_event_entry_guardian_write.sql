BEGIN;

-- Allow accepted guardians to update/delete event entries
-- for routines visible to them via kid-scoped guardian access.

DROP POLICY IF EXISTS event_entry_update ON public.event_entry;
CREATE POLICY event_entry_update ON public.event_entry
FOR UPDATE TO public
USING (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
)
WITH CHECK (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

DROP POLICY IF EXISTS event_entry_delete ON public.event_entry;
CREATE POLICY event_entry_delete ON public.event_entry
FOR DELETE TO public
USING (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

COMMIT;
