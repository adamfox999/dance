-- ============================================================
-- Allow share partners to see each other's kid profiles
-- & track which partner kids participate in a shared routine
-- ============================================================

-- 1) Column on dance_share to record which of the invited parent's kids are in this routine
ALTER TABLE dance_share
  ADD COLUMN IF NOT EXISTS partner_kid_ids UUID[] DEFAULT '{}';

-- 2) Share OWNER can read the INVITED user's kid profiles (after share is accepted)
CREATE POLICY "kid_profile_select_via_share_owner" ON kid_profile
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dance_share
      WHERE dance_share.status = 'accepted'
        AND dance_share.invited_user_id = kid_profile.parent_user_id
        AND dance_share.owner_user_id = auth.uid()
    )
  );

-- 3) INVITED user can read the OWNER's kid profiles (after share is accepted)
CREATE POLICY "kid_profile_select_via_share_invited" ON kid_profile
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dance_share
      WHERE dance_share.status = 'accepted'
        AND dance_share.owner_user_id = kid_profile.parent_user_id
        AND dance_share.invited_user_id = auth.uid()
    )
  );

-- 4) Allow share owners to read each other's user_profile (name/emoji) via share
CREATE POLICY "user_profile_select_via_share_owner" ON user_profile
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dance_share
      WHERE dance_share.status = 'accepted'
        AND dance_share.invited_user_id = user_profile.auth_user_id
        AND dance_share.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "user_profile_select_via_share_invited" ON user_profile
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dance_share
      WHERE dance_share.status = 'accepted'
        AND dance_share.owner_user_id = user_profile.auth_user_id
        AND dance_share.invited_user_id = auth.uid()
    )
  );
