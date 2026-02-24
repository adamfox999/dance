BEGIN;

CREATE TABLE IF NOT EXISTS public.dancer_discipline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kid_profile_id uuid NOT NULL REFERENCES public.kid_profile(id) ON DELETE CASCADE,
  discipline_name text NOT NULL,
  discipline_icon text NOT NULL DEFAULT '💃',
  current_grade text NOT NULL DEFAULT '',
  started_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dancer_discipline_owner_kid_name
  ON public.dancer_discipline (owner_id, kid_profile_id, discipline_name);

CREATE INDEX IF NOT EXISTS idx_dancer_discipline_owner_kid
  ON public.dancer_discipline (owner_id, kid_profile_id);

CREATE TABLE IF NOT EXISTS public.dancer_journey_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kid_profile_id uuid NOT NULL REFERENCES public.kid_profile(id) ON DELETE CASCADE,
  dancer_discipline_id uuid REFERENCES public.dancer_discipline(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('class', 'private-lesson', 'exam-goal', 'exam-result')),
  title text NOT NULL,
  details text,
  event_date date NOT NULL,
  exam_name text,
  exam_grade text,
  exam_result text,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dancer_journey_event_owner_kid_date
  ON public.dancer_journey_event (owner_id, kid_profile_id, event_date DESC, created_at DESC);

ALTER TABLE public.dancer_discipline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dancer_journey_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dancer_discipline_select ON public.dancer_discipline;
CREATE POLICY dancer_discipline_select ON public.dancer_discipline
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_discipline_insert ON public.dancer_discipline;
CREATE POLICY dancer_discipline_insert ON public.dancer_discipline
FOR INSERT TO public
WITH CHECK (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_discipline_update ON public.dancer_discipline;
CREATE POLICY dancer_discipline_update ON public.dancer_discipline
FOR UPDATE TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
)
WITH CHECK (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_discipline_delete ON public.dancer_discipline;
CREATE POLICY dancer_discipline_delete ON public.dancer_discipline
FOR DELETE TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_journey_event_select ON public.dancer_journey_event;
CREATE POLICY dancer_journey_event_select ON public.dancer_journey_event
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_journey_event_insert ON public.dancer_journey_event;
CREATE POLICY dancer_journey_event_insert ON public.dancer_journey_event
FOR INSERT TO public
WITH CHECK (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_journey_event_update ON public.dancer_journey_event;
CREATE POLICY dancer_journey_event_update ON public.dancer_journey_event
FOR UPDATE TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
)
WITH CHECK (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS dancer_journey_event_delete ON public.dancer_journey_event;
CREATE POLICY dancer_journey_event_delete ON public.dancer_journey_event
FOR DELETE TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

COMMIT;
