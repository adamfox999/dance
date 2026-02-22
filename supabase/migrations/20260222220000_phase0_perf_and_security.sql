-- ============================================================
-- Phase 0: Performance & security quick-wins
-- 1. Fix auth.uid() → (select auth.uid()) in all RLS policies
-- 2. Merge multiple permissive SELECT policies into single ones
-- 3. Merge multiple permissive UPDATE policies where possible
-- 4. Add missing FK indexes
-- 5. Drop duplicate invite_token index
-- 6. Fix set_updated_at search_path
-- 7. Drop orphaned app_state table
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DANCE TABLE — RLS policy rewrites
-- ============================================================

-- DROP old policies
DROP POLICY IF EXISTS dance_select_own ON dance;
DROP POLICY IF EXISTS dance_select_shared ON dance;
DROP POLICY IF EXISTS dance_select_via_guardian ON dance;
DROP POLICY IF EXISTS dance_insert_own ON dance;
DROP POLICY IF EXISTS dance_update_own ON dance;
DROP POLICY IF EXISTS dance_delete_own ON dance;

-- Single merged SELECT: own OR shared OR via guardian
CREATE POLICY dance_select ON dance FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR id IN (
      SELECT ds.dance_id FROM dance_share ds
      WHERE ds.status = 'accepted'
        AND (ds.invited_user_id = (select auth.uid())
             OR ds.invited_email = (select auth.jwt() ->> 'email'))
    )
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = dance.owner_id
    )
  );

CREATE POLICY dance_insert ON dance FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY dance_update ON dance FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY dance_delete ON dance FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 2. DANCE_SHARE TABLE — RLS policy rewrites
-- ============================================================

DROP POLICY IF EXISTS dance_share_owner_select ON dance_share;
DROP POLICY IF EXISTS dance_share_invited_select ON dance_share;
DROP POLICY IF EXISTS dance_share_select_by_token ON dance_share;
DROP POLICY IF EXISTS dance_share_owner_insert ON dance_share;
DROP POLICY IF EXISTS dance_share_owner_update ON dance_share;
DROP POLICY IF EXISTS dance_share_invited_update ON dance_share;
DROP POLICY IF EXISTS dance_share_update_by_token ON dance_share;
DROP POLICY IF EXISTS dance_share_owner_delete ON dance_share;

-- Single merged SELECT: owner OR invited OR valid token
CREATE POLICY dance_share_select ON dance_share FOR SELECT TO public
  USING (
    owner_user_id = (select auth.uid())
    OR (
      status = ANY (ARRAY['pending', 'accepted'])
      AND (
        invited_user_id = (select auth.uid())
        OR invited_email = (select auth.jwt() ->> 'email')
      )
    )
    OR (
      invite_token IS NOT NULL
      AND (token_expires_at IS NULL OR token_expires_at > now())
    )
  );

CREATE POLICY dance_share_insert ON dance_share FOR INSERT TO public
  WITH CHECK (owner_user_id = (select auth.uid()));

-- Single merged UPDATE: owner OR invited (pending) OR valid token (pending→accepted)
CREATE POLICY dance_share_update ON dance_share FOR UPDATE TO public
  USING (
    owner_user_id = (select auth.uid())
    OR (
      status = 'pending'
      AND invited_email = (select auth.jwt() ->> 'email')
    )
    OR (
      invite_token IS NOT NULL
      AND (token_expires_at IS NULL OR token_expires_at > now())
      AND status = 'pending'
    )
  )
  WITH CHECK (
    owner_user_id = (select auth.uid())
    OR status = 'accepted'
  );

CREATE POLICY dance_share_delete ON dance_share FOR DELETE TO public
  USING (owner_user_id = (select auth.uid()));

-- ============================================================
-- 3. FAMILY_GUARDIAN TABLE — RLS policy rewrites
-- ============================================================

DROP POLICY IF EXISTS family_guardian_owner_select ON family_guardian;
DROP POLICY IF EXISTS family_guardian_invited_select ON family_guardian;
DROP POLICY IF EXISTS family_guardian_owner_insert ON family_guardian;
DROP POLICY IF EXISTS family_guardian_owner_update ON family_guardian;
DROP POLICY IF EXISTS family_guardian_invited_update ON family_guardian;
DROP POLICY IF EXISTS family_guardian_owner_delete ON family_guardian;

-- Single merged SELECT: owner OR guardian OR pending invite token
CREATE POLICY family_guardian_select ON family_guardian FOR SELECT TO public
  USING (
    owner_user_id = (select auth.uid())
    OR guardian_user_id = (select auth.uid())
    OR guardian_email = (select auth.jwt() ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  );

CREATE POLICY family_guardian_insert ON family_guardian FOR INSERT TO public
  WITH CHECK (owner_user_id = (select auth.uid()));

-- Single merged UPDATE: owner OR guardian/email OR pending token
CREATE POLICY family_guardian_update ON family_guardian FOR UPDATE TO public
  USING (
    owner_user_id = (select auth.uid())
    OR guardian_user_id = (select auth.uid())
    OR guardian_email = (select auth.jwt() ->> 'email')
    OR (invite_token IS NOT NULL AND status = 'pending')
  )
  WITH CHECK (
    owner_user_id = (select auth.uid())
    OR guardian_user_id = (select auth.uid())
    OR guardian_email = (select auth.jwt() ->> 'email')
    OR invite_token IS NOT NULL
  );

CREATE POLICY family_guardian_delete ON family_guardian FOR DELETE TO public
  USING (owner_user_id = (select auth.uid()));

-- ============================================================
-- 4. FILE_METADATA TABLE — RLS policy rewrites
-- ============================================================

DROP POLICY IF EXISTS file_metadata_select_own ON file_metadata;
DROP POLICY IF EXISTS file_metadata_insert_own ON file_metadata;
DROP POLICY IF EXISTS file_metadata_update_own ON file_metadata;
DROP POLICY IF EXISTS file_metadata_delete_own ON file_metadata;

CREATE POLICY file_metadata_select ON file_metadata FOR SELECT TO public
  USING (owner_id = (select auth.uid()));

CREATE POLICY file_metadata_insert ON file_metadata FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY file_metadata_update ON file_metadata FOR UPDATE TO public
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY file_metadata_delete ON file_metadata FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- 5. KID_PROFILE TABLE — RLS policy rewrites
-- ============================================================

DROP POLICY IF EXISTS kid_profile_select_own ON kid_profile;
DROP POLICY IF EXISTS kid_profile_select_takeover ON kid_profile;
DROP POLICY IF EXISTS kid_profile_select_via_guardian ON kid_profile;
DROP POLICY IF EXISTS kid_profile_select_via_share_invited ON kid_profile;
DROP POLICY IF EXISTS kid_profile_select_via_share_owner ON kid_profile;
DROP POLICY IF EXISTS kid_profile_insert_own ON kid_profile;
DROP POLICY IF EXISTS kid_profile_update_own ON kid_profile;
DROP POLICY IF EXISTS kid_profile_update_takeover ON kid_profile;
DROP POLICY IF EXISTS kid_profile_delete_own ON kid_profile;

-- Single merged SELECT: own, takeover, guardian, share-invited, share-owner
CREATE POLICY kid_profile_select ON kid_profile FOR SELECT TO public
  USING (
    parent_user_id = (select auth.uid())
    OR takeover_auth_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = kid_profile.parent_user_id
        AND kid_profile.id = ANY(fg.kid_profile_ids)
    )
    OR EXISTS (
      SELECT 1 FROM dance_share ds
      WHERE ds.status = 'accepted'
        AND ds.owner_user_id = kid_profile.parent_user_id
        AND ds.invited_user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM dance_share ds
      WHERE ds.status = 'accepted'
        AND ds.invited_user_id = kid_profile.parent_user_id
        AND ds.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY kid_profile_insert ON kid_profile FOR INSERT TO public
  WITH CHECK (parent_user_id = (select auth.uid()));

-- Single merged UPDATE: own OR takeover
CREATE POLICY kid_profile_update ON kid_profile FOR UPDATE TO public
  USING (
    parent_user_id = (select auth.uid())
    OR takeover_auth_id = (select auth.uid())
  )
  WITH CHECK (
    parent_user_id = (select auth.uid())
    OR takeover_auth_id = (select auth.uid())
  );

CREATE POLICY kid_profile_delete ON kid_profile FOR DELETE TO public
  USING (parent_user_id = (select auth.uid()));

-- ============================================================
-- 6. USER_PROFILE TABLE — RLS policy rewrites
-- ============================================================

DROP POLICY IF EXISTS user_profile_select_own ON user_profile;
DROP POLICY IF EXISTS user_profile_select_shared ON user_profile;
DROP POLICY IF EXISTS user_profile_select_via_guardian ON user_profile;
DROP POLICY IF EXISTS user_profile_select_via_share_invited ON user_profile;
DROP POLICY IF EXISTS user_profile_select_via_share_owner ON user_profile;
DROP POLICY IF EXISTS user_profile_insert_own ON user_profile;
DROP POLICY IF EXISTS user_profile_update_own ON user_profile;

-- Single merged SELECT
CREATE POLICY user_profile_select ON user_profile FOR SELECT TO public
  USING (
    auth_user_id = (select auth.uid())
    OR auth_user_id IN (
      SELECT ds.owner_user_id FROM dance_share ds
      WHERE ds.status = 'accepted'
        AND (ds.invited_user_id = (select auth.uid())
             OR ds.invited_email = (select auth.jwt() ->> 'email'))
    )
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = user_profile.auth_user_id
    )
    OR EXISTS (
      SELECT 1 FROM dance_share ds
      WHERE ds.status = 'accepted'
        AND ds.owner_user_id = user_profile.auth_user_id
        AND ds.invited_user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM dance_share ds
      WHERE ds.status = 'accepted'
        AND ds.invited_user_id = user_profile.auth_user_id
        AND ds.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY user_profile_insert ON user_profile FOR INSERT TO public
  WITH CHECK (auth_user_id = (select auth.uid()));

CREATE POLICY user_profile_update ON user_profile FOR UPDATE TO public
  USING (auth_user_id = (select auth.uid()))
  WITH CHECK (auth_user_id = (select auth.uid()));

-- ============================================================
-- 7. ADD MISSING FK INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_dance_share_dance_id
  ON dance_share (dance_id);

CREATE INDEX IF NOT EXISTS idx_dance_share_owner_user_id
  ON dance_share (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_dance_share_invited_user_id
  ON dance_share (invited_user_id);

CREATE INDEX IF NOT EXISTS idx_family_guardian_guardian_user_id
  ON family_guardian (guardian_user_id);

CREATE INDEX IF NOT EXISTS idx_kid_profile_parent_user_id
  ON kid_profile (parent_user_id);

-- ============================================================
-- 8. DROP DUPLICATE INDEX
-- ============================================================

-- dance_share_invite_token_key (unique constraint) already provides an index.
-- The explicit dance_share_invite_token_idx is redundant.
DROP INDEX IF EXISTS dance_share_invite_token_idx;

-- ============================================================
-- 9. FIX set_updated_at FUNCTION SEARCH PATH
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 10. DROP ORPHANED app_state TABLE
-- ============================================================

DROP TABLE IF EXISTS public.app_state;

COMMIT;
