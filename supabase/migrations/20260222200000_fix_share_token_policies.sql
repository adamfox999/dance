-- Fix: allow token_expires_at to be NULL (meaning no expiry) in RLS policies
-- and allow the update to set invited_user_id and invited_email

DROP POLICY IF EXISTS "dance_share_select_by_token" ON dance_share;
CREATE POLICY "dance_share_select_by_token" ON dance_share
  FOR SELECT USING (
    invite_token IS NOT NULL
    AND (token_expires_at IS NULL OR token_expires_at > NOW())
  );

DROP POLICY IF EXISTS "dance_share_update_by_token" ON dance_share;
CREATE POLICY "dance_share_update_by_token" ON dance_share
  FOR UPDATE USING (
    invite_token IS NOT NULL
    AND (token_expires_at IS NULL OR token_expires_at > NOW())
    AND status = 'pending'
  );
