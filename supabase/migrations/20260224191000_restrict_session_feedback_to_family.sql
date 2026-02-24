BEGIN;

-- Privacy hardening: session rows contain feedback fields (e.g. dancer_reflection,
-- video_annotations, emoji_reactions). These must only be visible to owner and
-- same-family guardians, not general routine share recipients.

DROP POLICY IF EXISTS session_select ON public.session;

CREATE POLICY session_select ON public.session
FOR SELECT TO public
USING (
  owner_id = (SELECT auth.uid())
  OR (
    public.is_guardian_of(owner_id)
    AND routine_id IS NOT NULL
    AND public.routine_visible_to_guardian(routine_id, owner_id)
  )
);

COMMIT;
