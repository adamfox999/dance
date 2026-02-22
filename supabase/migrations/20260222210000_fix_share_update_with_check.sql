-- Fix: WITH CHECK must allow the new row values (invite_token=null, status=accepted)
DROP POLICY IF EXISTS "dance_share_update_by_token" ON dance_share;
CREATE POLICY "dance_share_update_by_token" ON dance_share
  FOR UPDATE
  USING (
    invite_token IS NOT NULL
    AND (token_expires_at IS NULL OR token_expires_at > NOW())
    AND status = 'pending'
  )
  WITH CHECK (
    status = 'accepted'
  );
