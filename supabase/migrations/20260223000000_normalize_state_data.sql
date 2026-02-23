-- ============================================================
-- NORMALIZE STATE DATA
-- Breaks the monolithic dance.state_data JSONB blob into
-- 14 individual tables with per-entity RLS.
-- ============================================================

BEGIN;

-- ============================================================
-- SECTION 1: CREATE ALL TABLES (no RLS yet)
-- ============================================================

-- 1. DISCIPLINE
CREATE TABLE public.discipline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '💃',
  current_grade TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_discipline_owner ON discipline(owner_id);
CREATE TRIGGER discipline_set_updated_at
  BEFORE UPDATE ON discipline FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. DISCIPLINE_ELEMENT
CREATE TABLE public.discipline_element (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id UUID NOT NULL REFERENCES discipline(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'learning'
    CHECK (status IN ('learning', 'confident', 'mastered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_discipline_element_discipline ON discipline_element(discipline_id);
CREATE INDEX idx_discipline_element_owner ON discipline_element(owner_id);
CREATE TRIGGER discipline_element_set_updated_at
  BEFORE UPDATE ON discipline_element FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. GRADE_HISTORY
CREATE TABLE public.grade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discipline_id UUID NOT NULL REFERENCES discipline(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  exam_date DATE,
  result TEXT NOT NULL DEFAULT '',
  feedback TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_grade_history_discipline ON grade_history(discipline_id);
CREATE INDEX idx_grade_history_owner ON grade_history(owner_id);

-- 4. ROUTINE
CREATE TABLE public.routine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  routine_type TEXT NOT NULL DEFAULT 'practice',
  formation TEXT NOT NULL DEFAULT 'solo',
  dancers TEXT[] NOT NULL DEFAULT '{}',
  discipline_id UUID REFERENCES discipline(id) ON DELETE SET NULL,
  kid_profile_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_routine_owner ON routine(owner_id);
CREATE INDEX idx_routine_discipline ON routine(discipline_id);
CREATE INDEX idx_routine_kids ON routine USING gin(kid_profile_ids);
CREATE TRIGGER routine_set_updated_at
  BEFORE UPDATE ON routine FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5. CHOREOGRAPHY_VERSION
CREATE TABLE public.choreography_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'v1',
  music_url TEXT NOT NULL DEFAULT '',
  music_file_name TEXT NOT NULL DEFAULT '',
  duration REAL NOT NULL DEFAULT 0,
  song_instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_sync_offset REAL NOT NULL DEFAULT 0,
  video_sync_confidence REAL,
  video_file_name TEXT NOT NULL DEFAULT '',
  video_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_choreo_version_routine ON choreography_version(routine_id);
CREATE INDEX idx_choreo_version_owner ON choreography_version(owner_id);
CREATE TRIGGER choreography_version_set_updated_at
  BEFORE UPDATE ON choreography_version FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. PRACTICE_VIDEO
CREATE TABLE public.practice_video (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id UUID NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_key TEXT NOT NULL DEFAULT '',
  video_name TEXT NOT NULL DEFAULT '',
  dancer_note TEXT NOT NULL DEFAULT '',
  dancer_feeling TEXT NOT NULL DEFAULT '',
  recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_practice_video_routine ON practice_video(routine_id);
CREATE INDEX idx_practice_video_owner ON practice_video(owner_id);

-- 7. SESSION
CREATE TABLE public.session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL DEFAULT 'practice',
  status TEXT NOT NULL DEFAULT 'scheduled',
  routine_id UUID REFERENCES routine(id) ON DELETE SET NULL,
  discipline_id UUID REFERENCES discipline(id) ON DELETE SET NULL,
  choreography_version_id UUID REFERENCES choreography_version(id) ON DELETE SET NULL,
  scheduled_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  rehearsal_video_key TEXT NOT NULL DEFAULT '',
  rehearsal_video_name TEXT NOT NULL DEFAULT '',
  dancer_reflection JSONB NOT NULL DEFAULT '{"feeling":"","note":"","goals":[]}'::jsonb,
  video_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  emoji_reactions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_session_owner ON session(owner_id);
CREATE INDEX idx_session_routine ON session(routine_id);
CREATE INDEX idx_session_discipline ON session(discipline_id);
CREATE TRIGGER session_set_updated_at
  BEFORE UPDATE ON session FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. EVENT
CREATE TABLE public.event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Event',
  event_date DATE,
  start_date DATE,
  end_date DATE,
  venue TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'show',
  competition_org TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  place INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_event_owner ON event(owner_id);
CREATE TRIGGER event_set_updated_at
  BEFORE UPDATE ON event FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 9. EVENT_ENTRY
CREATE TABLE public.event_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_id UUID REFERENCES routine(id) ON DELETE SET NULL,
  scheduled_date DATE,
  scheduled_time TEXT NOT NULL DEFAULT '',
  place INTEGER,
  qualified BOOLEAN NOT NULL DEFAULT FALSE,
  qualified_for_event_id UUID REFERENCES event(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_event_entry_event ON event_entry(event_id);
CREATE INDEX idx_event_entry_owner ON event_entry(owner_id);
CREATE INDEX idx_event_entry_routine ON event_entry(routine_id);
CREATE TRIGGER event_entry_set_updated_at
  BEFORE UPDATE ON event_entry FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 10. SCRAPBOOK_ENTRY
CREATE TABLE public.scrapbook_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  emoji_reactions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_scrapbook_entry_event ON scrapbook_entry(event_id);
CREATE INDEX idx_scrapbook_entry_owner ON scrapbook_entry(owner_id);

-- 11. STICKER
CREATE TABLE public.sticker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sticker_type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '⭐',
  earned_date DATE,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sticker_owner ON sticker(owner_id);

-- 12. PRACTICE_LOG
CREATE TABLE public.practice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, practice_date)
);
CREATE INDEX idx_practice_log_owner ON practice_log(owner_id);

-- 13. DANCER_PROFILE
CREATE TABLE public.dancer_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Dancing',
  current_focus_type TEXT,
  current_focus_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER dancer_profile_set_updated_at
  BEFORE UPDATE ON dancer_profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 14. DANCER_GOAL
CREATE TABLE public.dancer_goal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL DEFAULT '',
  created_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_dancer_goal_owner ON dancer_goal(owner_id);


-- ============================================================
-- SECTION 2: HELPER FUNCTIONS FOR KID-SCOPED RLS
-- ============================================================

-- Returns kid IDs the current user (guardian) can see for a given data owner
CREATE OR REPLACE FUNCTION public.guardian_kid_ids(check_owner_id uuid)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT kid_id),
    '{}'::uuid[]
  )
  FROM (
    SELECT unnest(fu.kid_profile_ids) AS kid_id
    FROM family_guardian fg
    JOIN family_unit fu ON fu.id = fg.family_unit_id
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = auth.uid()
      AND fg.owner_user_id = check_owner_id
    UNION ALL
    SELECT unnest(fg.kid_profile_ids) AS kid_id
    FROM family_guardian fg
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = auth.uid()
      AND fg.owner_user_id = check_owner_id
      AND fg.family_unit_id IS NULL
  ) sub
$$;

-- Check if a routine is visible to the current guardian (has overlapping kid IDs)
CREATE OR REPLACE FUNCTION public.routine_visible_to_guardian(
  check_routine_id uuid, check_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM routine r
    WHERE r.id = check_routine_id
      AND r.owner_id = check_owner_id
      AND r.kid_profile_ids && public.guardian_kid_ids(check_owner_id)
  )
$$;

-- Check if an event is visible to the current guardian
-- (has at least one entry linking to a routine with overlapping kid IDs)
CREATE OR REPLACE FUNCTION public.event_visible_to_guardian(
  check_event_id uuid, check_owner_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM event_entry ee
    JOIN routine r ON r.id = ee.routine_id
    WHERE ee.event_id = check_event_id
      AND r.owner_id = check_owner_id
      AND r.kid_profile_ids && public.guardian_kid_ids(check_owner_id)
  )
$$;


-- ============================================================
-- SECTION 3: RLS POLICIES
-- ============================================================

-- ---- DISCIPLINE (guardian-readable) ----
ALTER TABLE discipline ENABLE ROW LEVEL SECURITY;

CREATE POLICY discipline_select ON discipline FOR SELECT TO public
  USING (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY discipline_insert ON discipline FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY discipline_update ON discipline FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY discipline_delete ON discipline FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- DISCIPLINE_ELEMENT (guardian-readable) ----
ALTER TABLE discipline_element ENABLE ROW LEVEL SECURITY;

CREATE POLICY discipline_element_select ON discipline_element FOR SELECT TO public
  USING (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY discipline_element_insert ON discipline_element FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY discipline_element_update ON discipline_element FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY discipline_element_delete ON discipline_element FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- GRADE_HISTORY (guardian-readable) ----
ALTER TABLE grade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY grade_history_select ON grade_history FOR SELECT TO public
  USING (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY grade_history_insert ON grade_history FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY grade_history_update ON grade_history FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY grade_history_delete ON grade_history FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- ROUTINE (kid-scoped for guardians) ----
ALTER TABLE routine ENABLE ROW LEVEL SECURITY;

CREATE POLICY routine_select ON routine FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND kid_profile_ids && public.guardian_kid_ids(owner_id)
    )
  );

CREATE POLICY routine_insert ON routine FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY routine_update ON routine FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY routine_delete ON routine FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- CHOREOGRAPHY_VERSION (via routine visibility) ----
ALTER TABLE choreography_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY choreography_version_select ON choreography_version FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND public.routine_visible_to_guardian(routine_id, owner_id)
    )
  );

CREATE POLICY choreography_version_insert ON choreography_version FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY choreography_version_update ON choreography_version FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY choreography_version_delete ON choreography_version FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- PRACTICE_VIDEO (via routine visibility, guardian can insert) ----
ALTER TABLE practice_video ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_video_select ON practice_video FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND public.routine_visible_to_guardian(routine_id, owner_id)
    )
  );

CREATE POLICY practice_video_insert ON practice_video FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY practice_video_update ON practice_video FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY practice_video_delete ON practice_video FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- SESSION (kid-scoped via routine, guardian can write) ----
ALTER TABLE session ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_select ON session FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND routine_id IS NOT NULL
      AND public.routine_visible_to_guardian(routine_id, owner_id)
    )
  );

CREATE POLICY session_insert ON session FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY session_update ON session FOR UPDATE TO public
  USING (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id))
  WITH CHECK (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY session_delete ON session FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- EVENT (kid-scoped via event entries → routines) ----
ALTER TABLE event ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_select ON event FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND public.event_visible_to_guardian(id, owner_id)
    )
  );

CREATE POLICY event_insert ON event FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY event_update ON event FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY event_delete ON event FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- EVENT_ENTRY (via event visibility) ----
ALTER TABLE event_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_entry_select ON event_entry FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND public.event_visible_to_guardian(event_id, owner_id)
    )
  );

CREATE POLICY event_entry_insert ON event_entry FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY event_entry_update ON event_entry FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY event_entry_delete ON event_entry FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- SCRAPBOOK_ENTRY (via event visibility, guardian can write) ----
ALTER TABLE scrapbook_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY scrapbook_entry_select ON scrapbook_entry FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR (
      public.is_guardian_of(owner_id)
      AND public.event_visible_to_guardian(event_id, owner_id)
    )
  );

CREATE POLICY scrapbook_entry_insert ON scrapbook_entry FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY scrapbook_entry_update ON scrapbook_entry FOR UPDATE TO public
  USING (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id))
  WITH CHECK (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY scrapbook_entry_delete ON scrapbook_entry FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- STICKER (owner-only) ----
ALTER TABLE sticker ENABLE ROW LEVEL SECURITY;

CREATE POLICY sticker_select ON sticker FOR SELECT TO public
  USING (owner_id = (select auth.uid()));

CREATE POLICY sticker_insert ON sticker FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY sticker_delete ON sticker FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- PRACTICE_LOG (owner-only read, guardian can insert) ----
ALTER TABLE practice_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY practice_log_select ON practice_log FOR SELECT TO public
  USING (owner_id = (select auth.uid()));

CREATE POLICY practice_log_insert ON practice_log FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()) OR public.is_guardian_of(owner_id));

CREATE POLICY practice_log_delete ON practice_log FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ---- DANCER_PROFILE (owner-only) ----
ALTER TABLE dancer_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY dancer_profile_select ON dancer_profile FOR SELECT TO public
  USING (owner_id = (select auth.uid()));

CREATE POLICY dancer_profile_insert ON dancer_profile FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY dancer_profile_update ON dancer_profile FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

-- ---- DANCER_GOAL (owner-only) ----
ALTER TABLE dancer_goal ENABLE ROW LEVEL SECURITY;

CREATE POLICY dancer_goal_select ON dancer_goal FOR SELECT TO public
  USING (owner_id = (select auth.uid()));

CREATE POLICY dancer_goal_insert ON dancer_goal FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY dancer_goal_update ON dancer_goal FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY dancer_goal_delete ON dancer_goal FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

COMMIT;
