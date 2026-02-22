-- Create family_unit table
CREATE TABLE IF NOT EXISTS public.family_unit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My Family',
  kid_profile_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add family_unit_id to family_guardian
ALTER TABLE public.family_guardian
  ADD COLUMN IF NOT EXISTS family_unit_id uuid REFERENCES public.family_unit(id) ON DELETE SET NULL;

-- RLS on family_unit
ALTER TABLE public.family_unit ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their own units
CREATE POLICY family_unit_owner_all ON public.family_unit
  FOR ALL USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Guardians can SELECT units they belong to
CREATE POLICY family_unit_guardian_select ON public.family_unit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.family_guardian fg
      WHERE fg.family_unit_id = family_unit.id
        AND fg.guardian_user_id = auth.uid()
        AND fg.status = 'accepted'
    )
  );

-- Update kid_profile_select to also check family_unit.kid_profile_ids
DROP POLICY IF EXISTS kid_profile_select ON public.kid_profile;
CREATE POLICY kid_profile_select ON public.kid_profile FOR SELECT USING (
  parent_user_id = auth.uid()
  OR takeover_auth_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM family_guardian fg
    JOIN family_unit fu ON fu.id = fg.family_unit_id
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = auth.uid()
      AND fu.owner_user_id = kid_profile.parent_user_id
      AND kid_profile.id = ANY(fu.kid_profile_ids)
  )
  -- Legacy: also check kid_profile_ids on family_guardian directly
  OR EXISTS (
    SELECT 1 FROM family_guardian fg
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = auth.uid()
      AND fg.owner_user_id = kid_profile.parent_user_id
      AND kid_profile.id = ANY(fg.kid_profile_ids)
      AND fg.family_unit_id IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM dance_share ds
    WHERE ds.status = 'accepted'
      AND ds.owner_user_id = kid_profile.parent_user_id
      AND ds.invited_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM dance_share ds
    WHERE ds.status = 'accepted'
      AND ds.invited_user_id = kid_profile.parent_user_id
      AND ds.owner_user_id = auth.uid()
  )
);
