-- Advisor fixes: security + performance
-- - Harden helper functions with fixed search_path
-- - Add missing FK covering indexes
-- - Reduce RLS re-evaluation (auth initplan)
-- - Merge duplicate permissive SELECT policies

BEGIN;

-- ============================================================
-- 1) Harden helper functions (search_path immutable)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_share_recipient_of(check_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dance_share ds
    WHERE ds.owner_user_id = check_owner_id
      AND ds.status = 'accepted'
      AND (
        ds.invited_user_id = (select auth.uid())
        OR (
          ds.invited_user_id IS NULL
          AND ds.invited_email = ((select auth.jwt()) ->> 'email')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_share_recipient_for_routine(
  check_owner_id uuid,
  check_routine_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dance_share ds
    WHERE ds.owner_user_id = check_owner_id
      AND ds.status = 'accepted'
      AND (
        ds.routine_id IS NULL
        OR ds.routine_id = check_routine_id::text
      )
      AND (
        ds.invited_user_id = (select auth.uid())
        OR (
          ds.invited_user_id IS NULL
          AND ds.invited_email = ((select auth.jwt()) ->> 'email')
        )
      )
  );
$$;

-- ============================================================
-- 2) Missing FK indexes (covering indexes)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_event_entry_qualified_for_event_id
  ON public.event_entry (qualified_for_event_id);

CREATE INDEX IF NOT EXISTS idx_family_guardian_family_unit_id
  ON public.family_guardian (family_unit_id);

CREATE INDEX IF NOT EXISTS idx_family_unit_owner_user_id
  ON public.family_unit (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_session_choreography_version_id
  ON public.session (choreography_version_id);

-- ============================================================
-- 3) RLS initplan/perf fixes + merge duplicate SELECT policies
-- ============================================================

-- discipline
DROP POLICY IF EXISTS discipline_select ON public.discipline;
DROP POLICY IF EXISTS discipline_select_share ON public.discipline;
CREATE POLICY discipline_select ON public.discipline
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- discipline_element
DROP POLICY IF EXISTS discipline_element_select ON public.discipline_element;
DROP POLICY IF EXISTS discipline_element_select_share ON public.discipline_element;
CREATE POLICY discipline_element_select ON public.discipline_element
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- grade_history
DROP POLICY IF EXISTS grade_history_select ON public.grade_history;
DROP POLICY IF EXISTS grade_history_select_share ON public.grade_history;
CREATE POLICY grade_history_select ON public.grade_history
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- routine
DROP POLICY IF EXISTS routine_select ON public.routine;
DROP POLICY IF EXISTS routine_select_share ON public.routine;
CREATE POLICY routine_select ON public.routine
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_for_routine(owner_id, id)
);

-- choreography_version
DROP POLICY IF EXISTS choreography_version_select ON public.choreography_version;
DROP POLICY IF EXISTS choreography_version_select_share ON public.choreography_version;
CREATE POLICY choreography_version_select ON public.choreography_version
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_for_routine(owner_id, routine_id)
);

-- practice_video
DROP POLICY IF EXISTS practice_video_select ON public.practice_video;
DROP POLICY IF EXISTS practice_video_select_share ON public.practice_video;
CREATE POLICY practice_video_select ON public.practice_video
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_for_routine(owner_id, routine_id)
);

-- session
DROP POLICY IF EXISTS session_select ON public.session;
DROP POLICY IF EXISTS session_select_share ON public.session;
CREATE POLICY session_select ON public.session
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR (
    routine_id IS NOT NULL
    AND public.is_share_recipient_for_routine(owner_id, routine_id)
  )
);

-- event
DROP POLICY IF EXISTS event_select ON public.event;
DROP POLICY IF EXISTS event_select_share ON public.event;
CREATE POLICY event_select ON public.event
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- event_entry
DROP POLICY IF EXISTS event_entry_select ON public.event_entry;
DROP POLICY IF EXISTS event_entry_select_share ON public.event_entry;
CREATE POLICY event_entry_select ON public.event_entry
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- scrapbook_entry
DROP POLICY IF EXISTS scrapbook_entry_select ON public.scrapbook_entry;
DROP POLICY IF EXISTS scrapbook_entry_select_share ON public.scrapbook_entry;
CREATE POLICY scrapbook_entry_select ON public.scrapbook_entry
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- sticker
DROP POLICY IF EXISTS sticker_select ON public.sticker;
DROP POLICY IF EXISTS sticker_select_share ON public.sticker;
CREATE POLICY sticker_select ON public.sticker
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- practice_log
DROP POLICY IF EXISTS practice_log_select ON public.practice_log;
DROP POLICY IF EXISTS practice_log_select_share ON public.practice_log;
CREATE POLICY practice_log_select ON public.practice_log
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- dancer_profile
DROP POLICY IF EXISTS dancer_profile_select ON public.dancer_profile;
DROP POLICY IF EXISTS dancer_profile_select_share ON public.dancer_profile;
CREATE POLICY dancer_profile_select ON public.dancer_profile
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- dancer_goal
DROP POLICY IF EXISTS dancer_goal_select ON public.dancer_goal;
DROP POLICY IF EXISTS dancer_goal_select_share ON public.dancer_goal;
CREATE POLICY dancer_goal_select ON public.dancer_goal
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- file_metadata
DROP POLICY IF EXISTS file_metadata_select ON public.file_metadata;
DROP POLICY IF EXISTS file_metadata_select_share ON public.file_metadata;
CREATE POLICY file_metadata_select ON public.file_metadata
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_share_recipient_of(owner_id)
);

-- dance (initplan optimization)
DROP POLICY IF EXISTS dance_select ON public.dance;
CREATE POLICY dance_select ON public.dance FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR id IN (
      SELECT ds.dance_id FROM public.dance_share ds
      WHERE ds.status = 'accepted'
        AND (ds.invited_user_id = (select auth.uid())
             OR ds.invited_email = ((select auth.jwt()) ->> 'email'))
    )
    OR EXISTS (
      SELECT 1 FROM public.family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = dance.owner_id
    )
  );

-- dance_share (initplan optimization)
DROP POLICY IF EXISTS dance_share_select ON public.dance_share;
CREATE POLICY dance_share_select ON public.dance_share FOR SELECT TO public
  USING (
    owner_user_id = (select auth.uid())
    OR (
      status = ANY (ARRAY['pending', 'accepted'])
      AND (
        invited_user_id = (select auth.uid())
        OR invited_email = ((select auth.jwt()) ->> 'email')
      )
    )
    OR (
      invite_token IS NOT NULL
      AND (token_expires_at IS NULL OR token_expires_at > now())
    )
  );

DROP POLICY IF EXISTS dance_share_update ON public.dance_share;
CREATE POLICY dance_share_update ON public.dance_share FOR UPDATE TO public
  USING (
    owner_user_id = (select auth.uid())
    OR (
      status = 'pending'
      AND invited_email = ((select auth.jwt()) ->> 'email')
    )
    OR (
      invite_token IS NOT NULL
      AND (token_expires_at IS NULL OR token_expires_at > now())
      AND status = 'pending'
    )
  )
  WITH CHECK (
    owner_user_id = (select auth.uid())
    OR status = 'accepted'
  );

-- family_guardian (initplan optimization)
DROP POLICY IF EXISTS family_guardian_select ON public.family_guardian;
CREATE POLICY family_guardian_select ON public.family_guardian FOR SELECT TO public
  USING (
    owner_user_id = (select auth.uid())
    OR guardian_user_id = (select auth.uid())
    OR guardian_email = ((select auth.jwt()) ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  );

DROP POLICY IF EXISTS family_guardian_update ON public.family_guardian;
CREATE POLICY family_guardian_update ON public.family_guardian FOR UPDATE TO public
  USING (
    owner_user_id = (select auth.uid())
    OR guardian_user_id = (select auth.uid())
    OR guardian_email = ((select auth.jwt()) ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  )
  WITH CHECK (
    owner_user_id = (select auth.uid())
    OR guardian_user_id = (select auth.uid())
    OR guardian_email = ((select auth.jwt()) ->> 'email')
    OR invite_token IS NOT NULL
  );

-- user_profile (initplan optimization)
DROP POLICY IF EXISTS user_profile_select ON public.user_profile;
CREATE POLICY user_profile_select ON public.user_profile FOR SELECT TO public
  USING (
    auth_user_id = (select auth.uid())
    OR auth_user_id IN (
      SELECT ds.owner_user_id FROM public.dance_share ds
      WHERE ds.status = 'accepted'
        AND (ds.invited_user_id = (select auth.uid())
             OR ds.invited_email = ((select auth.jwt()) ->> 'email'))
    )
    OR EXISTS (
      SELECT 1 FROM public.family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = user_profile.auth_user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.dance_share ds
      WHERE ds.status = 'accepted'
        AND ds.owner_user_id = user_profile.auth_user_id
        AND ds.invited_user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.dance_share ds
      WHERE ds.status = 'accepted'
        AND ds.invited_user_id = user_profile.auth_user_id
        AND ds.owner_user_id = (select auth.uid())
    )
  );

-- kid_profile (initplan optimization + family-unit logic preserved)
DROP POLICY IF EXISTS kid_profile_select ON public.kid_profile;
CREATE POLICY kid_profile_select ON public.kid_profile FOR SELECT USING (
  parent_user_id = (select auth.uid())
  OR takeover_auth_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.family_guardian fg
    JOIN public.family_unit fu ON fu.id = fg.family_unit_id
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = (select auth.uid())
      AND fu.owner_user_id = kid_profile.parent_user_id
      AND kid_profile.id = ANY(fu.kid_profile_ids)
  )
  OR EXISTS (
    SELECT 1 FROM public.family_guardian fg
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = (select auth.uid())
      AND fg.owner_user_id = kid_profile.parent_user_id
      AND kid_profile.id = ANY(fg.kid_profile_ids)
      AND fg.family_unit_id IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.dance_share ds
    WHERE ds.status = 'accepted'
      AND ds.owner_user_id = kid_profile.parent_user_id
      AND ds.invited_user_id = (select auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.dance_share ds
    WHERE ds.status = 'accepted'
      AND ds.invited_user_id = kid_profile.parent_user_id
      AND ds.owner_user_id = (select auth.uid())
  )
);

-- family_unit: avoid two permissive SELECT policies and auth re-eval
DROP POLICY IF EXISTS family_unit_owner_all ON public.family_unit;
DROP POLICY IF EXISTS family_unit_guardian_select ON public.family_unit;

CREATE POLICY family_unit_select ON public.family_unit
FOR SELECT TO public
USING (
  owner_user_id = (select auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.family_guardian fg
    WHERE fg.family_unit_id = family_unit.id
      AND fg.guardian_user_id = (select auth.uid())
      AND fg.status = 'accepted'
  )
);

CREATE POLICY family_unit_insert ON public.family_unit
FOR INSERT TO public
WITH CHECK (owner_user_id = (select auth.uid()));

CREATE POLICY family_unit_update ON public.family_unit
FOR UPDATE TO public
USING (owner_user_id = (select auth.uid()))
WITH CHECK (owner_user_id = (select auth.uid()));

CREATE POLICY family_unit_delete ON public.family_unit
FOR DELETE TO public
USING (owner_user_id = (select auth.uid()));

COMMIT;
