-- ============================================================
-- FAMILY GUARDIANS — co-parents / partners with per-kid access
-- Supports divorced parents, step-parents, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS family_guardian (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guardian_email TEXT,
  guardian_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_token TEXT,
  kid_profile_ids UUID[] NOT NULL DEFAULT '{}',
  role TEXT NOT NULL DEFAULT 'co-parent' CHECK (role IN ('co-parent', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-time invite token must be unique
CREATE UNIQUE INDEX IF NOT EXISTS family_guardian_invite_token_unique
  ON family_guardian (invite_token)
  WHERE invite_token IS NOT NULL;

CREATE TRIGGER family_guardian_set_updated_at
  BEFORE UPDATE ON family_guardian
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE family_guardian ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own guardian records
CREATE POLICY "family_guardian_owner_select" ON family_guardian
  FOR SELECT USING (owner_user_id = auth.uid());

CREATE POLICY "family_guardian_owner_insert" ON family_guardian
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "family_guardian_owner_update" ON family_guardian
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "family_guardian_owner_delete" ON family_guardian
  FOR DELETE USING (owner_user_id = auth.uid());

-- Guardian can see invites addressed to them (by email, user id, or token)
CREATE POLICY "family_guardian_invited_select" ON family_guardian
  FOR SELECT USING (
    guardian_user_id = auth.uid()
    OR guardian_email = (auth.jwt() ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  );

-- Guardian can accept (update status + link their user id) — by email, user id, or token
CREATE POLICY "family_guardian_invited_update" ON family_guardian
  FOR UPDATE USING (
    guardian_user_id = auth.uid()
    OR guardian_email = (auth.jwt() ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  ) WITH CHECK (
    guardian_user_id = auth.uid()
    OR guardian_email = (auth.jwt() ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  );

-- ============================================================
-- Kid profile access for accepted guardians
-- ============================================================

-- Guardian can see kid profiles assigned to them
CREATE POLICY "kid_profile_select_via_guardian" ON kid_profile
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = auth.uid()
        AND fg.owner_user_id = kid_profile.parent_user_id
        AND kid_profile.id = ANY(fg.kid_profile_ids)
    )
  );

-- Guardian can view the owner's user_profile (to show name/emoji)
CREATE POLICY "user_profile_select_via_guardian" ON user_profile
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = auth.uid()
        AND fg.owner_user_id = user_profile.auth_user_id
    )
  );

-- Guardian can view the owner's dance row (read-only, for routines)
CREATE POLICY "dance_select_via_guardian" ON dance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = auth.uid()
        AND fg.owner_user_id = dance.owner_id
    )
  );
