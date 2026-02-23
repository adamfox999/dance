BEGIN;

-- Restore guardian-family visibility that was unintentionally narrowed
-- when SELECT policies were consolidated for share recipients.

DROP POLICY IF EXISTS discipline_select ON public.discipline;
CREATE POLICY discipline_select ON public.discipline
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
  OR public.is_share_recipient_of(owner_id)
);

DROP POLICY IF EXISTS discipline_element_select ON public.discipline_element;
CREATE POLICY discipline_element_select ON public.discipline_element
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
  OR public.is_share_recipient_of(owner_id)
);

DROP POLICY IF EXISTS grade_history_select ON public.grade_history;
CREATE POLICY grade_history_select ON public.grade_history
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
  OR public.is_share_recipient_of(owner_id)
);

DROP POLICY IF EXISTS routine_select ON public.routine;
CREATE POLICY routine_select ON public.routine
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_for_routine(owner_id, id)
  OR (
    public.is_guardian_of(owner_id)
    AND kid_profile_ids && public.guardian_kid_ids(owner_id)
  )
);

DROP POLICY IF EXISTS choreography_version_select ON public.choreography_version;
CREATE POLICY choreography_version_select ON public.choreography_version
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_for_routine(owner_id, routine_id)
  OR (
    public.is_guardian_of(owner_id)
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

DROP POLICY IF EXISTS practice_video_select ON public.practice_video;
CREATE POLICY practice_video_select ON public.practice_video
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_for_routine(owner_id, routine_id)
  OR (
    public.is_guardian_of(owner_id)
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

DROP POLICY IF EXISTS session_select ON public.session;
CREATE POLICY session_select ON public.session
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR (
    routine_id IS NOT NULL
    AND public.is_share_recipient_for_routine(owner_id, routine_id)
  )
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

DROP POLICY IF EXISTS event_select ON public.event;
CREATE POLICY event_select ON public.event
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
  OR (
    public.is_guardian_of(owner_id)
    AND public.event_visible_to_guardian(id, owner_id)
  )
);

DROP POLICY IF EXISTS event_entry_select ON public.event_entry;
CREATE POLICY event_entry_select ON public.event_entry
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

DROP POLICY IF EXISTS scrapbook_entry_select ON public.scrapbook_entry;
CREATE POLICY scrapbook_entry_select ON public.scrapbook_entry
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
  OR (
    public.is_guardian_of(owner_id)
    AND public.event_visible_to_guardian(event_id, owner_id)
  )
);

DROP POLICY IF EXISTS file_metadata_select ON public.file_metadata;
CREATE POLICY file_metadata_select ON public.file_metadata
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
  OR public.is_share_recipient_of(owner_id)
);

COMMIT;
