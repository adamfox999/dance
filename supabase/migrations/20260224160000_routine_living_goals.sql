-- Migration: routine_living_goals
-- Evolves the practice reflection system from single-session goals + separate
-- pre-practice check-in into a "living goals" coaching loop where goals persist
-- per-routine until mastered.
--
-- Changes:
--   1. practice_reflection_goal: add mastered_at (null = still active)
--   2. practice_reflection_goal_checkin: widen rating from (-1,1) to (1,2,3)
--      1 = 😤 (tough), 2 = 😊 (okay), 3 = 🤩 (nailed it / mastered)
--   3. practice_reflection: drop summary_label column (no longer in UI)

BEGIN;

-- 1. Add mastered_at to goals
ALTER TABLE public.practice_reflection_goal
  ADD COLUMN IF NOT EXISTS mastered_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Widen rating constraint on checkins from (-1,1) to (1,2,3)
-- First drop the old constraint, then add the new one.
ALTER TABLE public.practice_reflection_goal_checkin
  DROP CONSTRAINT IF EXISTS practice_reflection_goal_checkin_rating_check;

ALTER TABLE public.practice_reflection_goal_checkin
  ADD CONSTRAINT practice_reflection_goal_checkin_rating_check CHECK (rating IN (1, 2, 3));

-- 3. Drop summary_label from practice_reflection
ALTER TABLE public.practice_reflection
  DROP COLUMN IF EXISTS summary_label;

-- Index for fast "active goals for a routine" query
CREATE INDEX IF NOT EXISTS idx_practice_reflection_goal_active
  ON public.practice_reflection_goal(reflection_id)
  WHERE mastered_at IS NULL;

COMMIT;
