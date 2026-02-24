BEGIN;

-- Discipline data should only be visible to the owner or accepted guardians.
-- Routine share recipients should NOT receive discipline tables.

DROP POLICY IF EXISTS discipline_select ON public.discipline;
CREATE POLICY discipline_select ON public.discipline
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS discipline_element_select ON public.discipline_element;
CREATE POLICY discipline_element_select ON public.discipline_element
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

DROP POLICY IF EXISTS grade_history_select ON public.grade_history;
CREATE POLICY grade_history_select ON public.grade_history
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
);

COMMIT;
