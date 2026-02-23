BEGIN;

-- Allow accepted guardians to delete scrapbook media/notes
-- for events they are allowed to view for that owner.
DROP POLICY IF EXISTS scrapbook_entry_delete ON public.scrapbook_entry;

CREATE POLICY scrapbook_entry_delete ON public.scrapbook_entry
FOR DELETE TO public
USING (
  owner_id = (select auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND public.event_visible_to_guardian(event_id, owner_id)
  )
);

COMMIT;
