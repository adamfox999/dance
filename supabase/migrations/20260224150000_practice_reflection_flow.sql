BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_reflection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.session(id) ON DELETE CASCADE,
  routine_id UUID REFERENCES public.routine(id) ON DELETE SET NULL,
  summary_label TEXT NOT NULL DEFAULT '',
  reflection_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_reflection_session ON public.practice_reflection(session_id);
CREATE INDEX IF NOT EXISTS idx_practice_reflection_routine_created ON public.practice_reflection(routine_id, created_at DESC);

DROP TRIGGER IF EXISTS practice_reflection_set_updated_at ON public.practice_reflection;
CREATE TRIGGER practice_reflection_set_updated_at
  BEFORE UPDATE ON public.practice_reflection
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.practice_reflection_goal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID NOT NULL REFERENCES public.practice_reflection(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_reflection_goal_reflection ON public.practice_reflection_goal(reflection_id, sort_order, created_at);

DROP TRIGGER IF EXISTS practice_reflection_goal_set_updated_at ON public.practice_reflection_goal;
CREATE TRIGGER practice_reflection_goal_set_updated_at
  BEFORE UPDATE ON public.practice_reflection_goal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.practice_reflection_goal_checkin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.session(id) ON DELETE CASCADE,
  prior_goal_id UUID NOT NULL REFERENCES public.practice_reflection_goal(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, prior_goal_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_reflection_goal_checkin_session ON public.practice_reflection_goal_checkin(session_id);
CREATE INDEX IF NOT EXISTS idx_practice_reflection_goal_checkin_goal ON public.practice_reflection_goal_checkin(prior_goal_id);

DROP TRIGGER IF EXISTS practice_reflection_goal_checkin_set_updated_at ON public.practice_reflection_goal_checkin;
CREATE TRIGGER practice_reflection_goal_checkin_set_updated_at
  BEFORE UPDATE ON public.practice_reflection_goal_checkin
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.practice_reflection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_reflection_goal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_reflection_goal_checkin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_reflection_select ON public.practice_reflection;
CREATE POLICY practice_reflection_select ON public.practice_reflection
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_insert ON public.practice_reflection;
CREATE POLICY practice_reflection_insert ON public.practice_reflection
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_update ON public.practice_reflection;
CREATE POLICY practice_reflection_update ON public.practice_reflection
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_delete ON public.practice_reflection;
CREATE POLICY practice_reflection_delete ON public.practice_reflection
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_select ON public.practice_reflection_goal;
CREATE POLICY practice_reflection_goal_select ON public.practice_reflection_goal
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.practice_reflection pr
    JOIN public.session s ON s.id = pr.session_id
    WHERE pr.id = practice_reflection_goal.reflection_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_insert ON public.practice_reflection_goal;
CREATE POLICY practice_reflection_goal_insert ON public.practice_reflection_goal
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.practice_reflection pr
    JOIN public.session s ON s.id = pr.session_id
    WHERE pr.id = practice_reflection_goal.reflection_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_update ON public.practice_reflection_goal;
CREATE POLICY practice_reflection_goal_update ON public.practice_reflection_goal
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.practice_reflection pr
    JOIN public.session s ON s.id = pr.session_id
    WHERE pr.id = practice_reflection_goal.reflection_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.practice_reflection pr
    JOIN public.session s ON s.id = pr.session_id
    WHERE pr.id = practice_reflection_goal.reflection_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_delete ON public.practice_reflection_goal;
CREATE POLICY practice_reflection_goal_delete ON public.practice_reflection_goal
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.practice_reflection pr
    JOIN public.session s ON s.id = pr.session_id
    WHERE pr.id = practice_reflection_goal.reflection_id
      AND (
        s.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(s.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_checkin_select ON public.practice_reflection_goal_checkin;
CREATE POLICY practice_reflection_goal_checkin_select ON public.practice_reflection_goal_checkin
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session current_session
    JOIN public.practice_reflection_goal prior_goal ON prior_goal.id = practice_reflection_goal_checkin.prior_goal_id
    JOIN public.practice_reflection prior_reflection ON prior_reflection.id = prior_goal.reflection_id
    JOIN public.session prior_session ON prior_session.id = prior_reflection.session_id
    WHERE current_session.id = practice_reflection_goal_checkin.session_id
      AND prior_session.owner_id = current_session.owner_id
      AND (
        current_session.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(current_session.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_checkin_insert ON public.practice_reflection_goal_checkin;
CREATE POLICY practice_reflection_goal_checkin_insert ON public.practice_reflection_goal_checkin
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session current_session
    JOIN public.practice_reflection_goal prior_goal ON prior_goal.id = practice_reflection_goal_checkin.prior_goal_id
    JOIN public.practice_reflection prior_reflection ON prior_reflection.id = prior_goal.reflection_id
    JOIN public.session prior_session ON prior_session.id = prior_reflection.session_id
    WHERE current_session.id = practice_reflection_goal_checkin.session_id
      AND prior_session.owner_id = current_session.owner_id
      AND (
        current_session.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(current_session.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_checkin_update ON public.practice_reflection_goal_checkin;
CREATE POLICY practice_reflection_goal_checkin_update ON public.practice_reflection_goal_checkin
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session current_session
    JOIN public.practice_reflection_goal prior_goal ON prior_goal.id = practice_reflection_goal_checkin.prior_goal_id
    JOIN public.practice_reflection prior_reflection ON prior_reflection.id = prior_goal.reflection_id
    JOIN public.session prior_session ON prior_session.id = prior_reflection.session_id
    WHERE current_session.id = practice_reflection_goal_checkin.session_id
      AND prior_session.owner_id = current_session.owner_id
      AND (
        current_session.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(current_session.owner_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session current_session
    JOIN public.practice_reflection_goal prior_goal ON prior_goal.id = practice_reflection_goal_checkin.prior_goal_id
    JOIN public.practice_reflection prior_reflection ON prior_reflection.id = prior_goal.reflection_id
    JOIN public.session prior_session ON prior_session.id = prior_reflection.session_id
    WHERE current_session.id = practice_reflection_goal_checkin.session_id
      AND prior_session.owner_id = current_session.owner_id
      AND (
        current_session.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(current_session.owner_id)
      )
  )
);

DROP POLICY IF EXISTS practice_reflection_goal_checkin_delete ON public.practice_reflection_goal_checkin;
CREATE POLICY practice_reflection_goal_checkin_delete ON public.practice_reflection_goal_checkin
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session current_session
    JOIN public.practice_reflection_goal prior_goal ON prior_goal.id = practice_reflection_goal_checkin.prior_goal_id
    JOIN public.practice_reflection prior_reflection ON prior_reflection.id = prior_goal.reflection_id
    JOIN public.session prior_session ON prior_session.id = prior_reflection.session_id
    WHERE current_session.id = practice_reflection_goal_checkin.session_id
      AND prior_session.owner_id = current_session.owner_id
      AND (
        current_session.owner_id = (SELECT auth.uid())
        OR public.is_guardian_of(current_session.owner_id)
      )
  )
);

COMMIT;
