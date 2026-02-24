BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_kid_feedback(owner_user UUID, kid_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RETURN FALSE;
  END IF;

  IF uid = owner_user THEN
    RETURN TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.kid_profile kp
    WHERE kp.id = kid_id
      AND kp.parent_user_id = owner_user
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.family_guardian fg
    WHERE fg.owner_user_id = owner_user
      AND fg.guardian_user_id = uid
      AND fg.status = 'accepted'
      AND (
        COALESCE(array_length(fg.kid_profile_ids, 1), 0) = 0
        OR kid_id = ANY (fg.kid_profile_ids)
      )
  );
END;
$$;


CREATE TABLE IF NOT EXISTS public.session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.session(id) ON DELETE CASCADE,
  kid_profile_id UUID NOT NULL REFERENCES public.kid_profile(id) ON DELETE CASCADE,
  dancer_reflection JSONB NOT NULL DEFAULT '{"feeling":"","note":"","goals":[]}'::jsonb,
  video_annotations JSONB NOT NULL DEFAULT '[]'::jsonb,
  emoji_reactions TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, kid_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_session_feedback_session_kid ON public.session_feedback(session_id, kid_profile_id);

DROP TRIGGER IF EXISTS session_feedback_set_updated_at ON public.session_feedback;
CREATE TRIGGER session_feedback_set_updated_at
  BEFORE UPDATE ON public.session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.session_feedback (session_id, kid_profile_id, dancer_reflection, video_annotations, emoji_reactions)
SELECT
  s.id,
  kid_id,
  COALESCE(s.dancer_reflection, '{"feeling":"","note":"","goals":[]}'::jsonb),
  COALESCE(s.video_annotations, '[]'::jsonb),
  COALESCE(s.emoji_reactions, '{}'::text[])
FROM public.session s
JOIN public.routine r ON r.id = s.routine_id
CROSS JOIN LATERAL unnest(COALESCE(r.kid_profile_ids, '{}'::uuid[])) AS kid_id
ON CONFLICT (session_id, kid_profile_id) DO NOTHING;

ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_feedback_select ON public.session_feedback;
CREATE POLICY session_feedback_select ON public.session_feedback
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = session_feedback.session_id
      AND public.can_access_kid_feedback(s.owner_id, session_feedback.kid_profile_id)
  )
);

DROP POLICY IF EXISTS session_feedback_insert ON public.session_feedback;
CREATE POLICY session_feedback_insert ON public.session_feedback
FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = session_feedback.session_id
      AND public.can_access_kid_feedback(s.owner_id, session_feedback.kid_profile_id)
  )
);

DROP POLICY IF EXISTS session_feedback_update ON public.session_feedback;
CREATE POLICY session_feedback_update ON public.session_feedback
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = session_feedback.session_id
      AND public.can_access_kid_feedback(s.owner_id, session_feedback.kid_profile_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = session_feedback.session_id
      AND public.can_access_kid_feedback(s.owner_id, session_feedback.kid_profile_id)
  )
);

DROP POLICY IF EXISTS session_feedback_delete ON public.session_feedback;
CREATE POLICY session_feedback_delete ON public.session_feedback
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = session_feedback.session_id
      AND public.can_access_kid_feedback(s.owner_id, session_feedback.kid_profile_id)
  )
);


ALTER TABLE public.practice_reflection
  ADD COLUMN IF NOT EXISTS kid_profile_id UUID REFERENCES public.kid_profile(id) ON DELETE SET NULL;

UPDATE public.practice_reflection pr
SET kid_profile_id = sub.kid_id
FROM (
  SELECT pr2.id, r.kid_profile_ids[1] AS kid_id
  FROM public.practice_reflection pr2
  JOIN public.session s ON s.id = pr2.session_id
  JOIN public.routine r ON r.id = s.routine_id
  WHERE array_length(r.kid_profile_ids, 1) > 0
) sub
WHERE pr.id = sub.id
  AND pr.kid_profile_id IS NULL;

UPDATE public.practice_reflection pr
SET kid_profile_id = sf.kid_profile_id
FROM public.session_feedback sf
WHERE pr.session_id = sf.session_id
  AND pr.kid_profile_id IS NULL;

ALTER TABLE public.practice_reflection
  DROP CONSTRAINT IF EXISTS practice_reflection_session_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_reflection_session_kid_unique
  ON public.practice_reflection(session_id, kid_profile_id)
  WHERE kid_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_practice_reflection_session_kid
  ON public.practice_reflection(session_id, kid_profile_id);


ALTER TABLE public.practice_reflection_goal_checkin
  ADD COLUMN IF NOT EXISTS kid_profile_id UUID REFERENCES public.kid_profile(id) ON DELETE SET NULL;

UPDATE public.practice_reflection_goal_checkin gc
SET kid_profile_id = pr.kid_profile_id
FROM public.practice_reflection_goal g
JOIN public.practice_reflection pr ON pr.id = g.reflection_id
WHERE g.id = gc.prior_goal_id
  AND gc.kid_profile_id IS NULL;

ALTER TABLE public.practice_reflection_goal_checkin
  DROP CONSTRAINT IF EXISTS practice_reflection_goal_checkin_session_id_prior_goal_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_reflection_goal_checkin_session_goal_kid_unique
  ON public.practice_reflection_goal_checkin(session_id, prior_goal_id, kid_profile_id)
  WHERE kid_profile_id IS NOT NULL;


DROP POLICY IF EXISTS practice_reflection_select ON public.practice_reflection;
CREATE POLICY practice_reflection_select ON public.practice_reflection
FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND public.can_access_kid_feedback(s.owner_id, practice_reflection.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, practice_reflection.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, practice_reflection.kid_profile_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.session s
    WHERE s.id = practice_reflection.session_id
      AND public.can_access_kid_feedback(s.owner_id, practice_reflection.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, practice_reflection.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, pr.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, pr.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, pr.kid_profile_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.practice_reflection pr
    JOIN public.session s ON s.id = pr.session_id
    WHERE pr.id = practice_reflection_goal.reflection_id
      AND public.can_access_kid_feedback(s.owner_id, pr.kid_profile_id)
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
      AND public.can_access_kid_feedback(s.owner_id, pr.kid_profile_id)
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
      AND prior_reflection.kid_profile_id = practice_reflection_goal_checkin.kid_profile_id
      AND public.can_access_kid_feedback(current_session.owner_id, practice_reflection_goal_checkin.kid_profile_id)
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
      AND prior_reflection.kid_profile_id = practice_reflection_goal_checkin.kid_profile_id
      AND public.can_access_kid_feedback(current_session.owner_id, practice_reflection_goal_checkin.kid_profile_id)
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
      AND prior_reflection.kid_profile_id = practice_reflection_goal_checkin.kid_profile_id
      AND public.can_access_kid_feedback(current_session.owner_id, practice_reflection_goal_checkin.kid_profile_id)
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
      AND prior_reflection.kid_profile_id = practice_reflection_goal_checkin.kid_profile_id
      AND public.can_access_kid_feedback(current_session.owner_id, practice_reflection_goal_checkin.kid_profile_id)
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
      AND prior_reflection.kid_profile_id = practice_reflection_goal_checkin.kid_profile_id
      AND public.can_access_kid_feedback(current_session.owner_id, practice_reflection_goal_checkin.kid_profile_id)
  )
);

COMMIT;
