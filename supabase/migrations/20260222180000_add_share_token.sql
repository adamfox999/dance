-- ============================================================
-- Add invite_token support to dance_share
-- Allows sharing via one-time links instead of email
-- ============================================================

ALTER TABLE dance_share
  ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS token_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- Index for token lookups
CREATE INDEX IF NOT EXISTS dance_share_invite_token_idx ON dance_share(invite_token);

-- Allow unauthenticated users to see shares by token (for link acceptance flow)
CREATE POLICY "dance_share_select_by_token" ON dance_share
  FOR SELECT USING (
    invite_token IS NOT NULL
    AND token_expires_at > NOW()
  );

-- Allow unauthenticated users to accept a share by token
CREATE POLICY "dance_share_update_by_token" ON dance_share
  FOR UPDATE USING (
    invite_token IS NOT NULL
    AND token_expires_at > NOW()
    AND status = 'pending'
  )
  WITH CHECK (
    status = 'accepted'
  );
