-- ============================================================
-- Add takeover support to kid_profile & assign kids to routines
-- ============================================================

-- 1) Allow a kid to eventually take over with their own auth account
ALTER TABLE kid_profile
  ADD COLUMN IF NOT EXISTS takeover_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Unique constraint so one auth account can only take over one kid profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kid_profile_takeover_auth_unique'
      AND conrelid = 'kid_profile'::regclass
  ) THEN
    ALTER TABLE kid_profile
      ADD CONSTRAINT kid_profile_takeover_auth_unique UNIQUE (takeover_auth_id);
  END IF;
END $$;

-- 2) Allow a user who has taken over a kid profile to read it
CREATE POLICY "kid_profile_select_takeover" ON kid_profile
  FOR SELECT USING (takeover_auth_id = auth.uid());

CREATE POLICY "kid_profile_update_takeover" ON kid_profile
  FOR UPDATE USING (takeover_auth_id = auth.uid())
  WITH CHECK (takeover_auth_id = auth.uid());
