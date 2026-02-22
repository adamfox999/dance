-- ============================================================
-- 1) USER PROFILES — adult (auth-linked) & managed kids
-- ============================================================

-- Adult profiles (one per auth user)
CREATE TABLE IF NOT EXISTS user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '👤',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Managed kid profiles — owned by a parent, no auth account
CREATE TABLE IF NOT EXISTS kid_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '💃',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at
CREATE TRIGGER user_profile_set_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER kid_profile_set_updated_at
  BEFORE UPDATE ON kid_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS for user_profile
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profile_select_own" ON user_profile
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "user_profile_insert_own" ON user_profile
  FOR INSERT WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "user_profile_update_own" ON user_profile
  FOR UPDATE USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- RLS for kid_profile
ALTER TABLE kid_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kid_profile_select_own" ON kid_profile
  FOR SELECT USING (parent_user_id = auth.uid());

CREATE POLICY "kid_profile_insert_own" ON kid_profile
  FOR INSERT WITH CHECK (parent_user_id = auth.uid());

CREATE POLICY "kid_profile_update_own" ON kid_profile
  FOR UPDATE USING (parent_user_id = auth.uid())
  WITH CHECK (parent_user_id = auth.uid());

CREATE POLICY "kid_profile_delete_own" ON kid_profile
  FOR DELETE USING (parent_user_id = auth.uid());


-- ============================================================
-- 2) DANCE SHARES — invite other parents to view a routine
-- ============================================================

CREATE TABLE IF NOT EXISTS dance_share (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dance_id BIGINT NOT NULL REFERENCES dance(id) ON DELETE CASCADE,
  routine_id TEXT,                                    -- null = share all routines
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'collaborator')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER dance_share_set_updated_at
  BEFORE UPDATE ON dance_share
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE dance_share ENABLE ROW LEVEL SECURITY;

-- Owner can do everything on their own shares
CREATE POLICY "dance_share_owner_select" ON dance_share
  FOR SELECT USING (owner_user_id = auth.uid());

CREATE POLICY "dance_share_owner_insert" ON dance_share
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "dance_share_owner_update" ON dance_share
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "dance_share_owner_delete" ON dance_share
  FOR DELETE USING (owner_user_id = auth.uid());

-- Invited user can see pending/accepted shares addressed to them
CREATE POLICY "dance_share_invited_select" ON dance_share
  FOR SELECT USING (
    status IN ('pending', 'accepted')
    AND (
      invited_user_id = auth.uid()
      OR invited_email = (auth.jwt() ->> 'email')
    )
  );

-- Invited user can accept (update) their own pending share
CREATE POLICY "dance_share_invited_update" ON dance_share
  FOR UPDATE USING (
    status = 'pending'
    AND invited_email = (auth.jwt() ->> 'email')
  )
  WITH CHECK (
    invited_user_id = auth.uid()
    AND status = 'accepted'
  );


-- ============================================================
-- 3) Let shared users READ dance rows they've been invited to
-- ============================================================

CREATE POLICY "dance_select_shared" ON dance
  FOR SELECT USING (
    id IN (
      SELECT dance_id FROM dance_share
      WHERE status = 'accepted'
        AND (
          invited_user_id = auth.uid()
          OR invited_email = (auth.jwt() ->> 'email')
        )
    )
  );

-- Let shared users also read shared user's profile (so they see the owner name)
CREATE POLICY "user_profile_select_shared" ON user_profile
  FOR SELECT USING (
    auth_user_id IN (
      SELECT owner_user_id FROM dance_share
      WHERE status = 'accepted'
        AND (
          invited_user_id = auth.uid()
          OR invited_email = (auth.jwt() ->> 'email')
        )
    )
  );
