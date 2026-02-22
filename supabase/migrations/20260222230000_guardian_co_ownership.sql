-- ============================================================
-- Guardian Co-Ownership
-- Allow accepted guardians full read/write access to:
--   1. dance table (UPDATE)
--   2. file_metadata table (SELECT, INSERT, UPDATE, DELETE)
--   3. storage.objects in the owner's folder
-- ============================================================

BEGIN;

-- Helper: check if the current user is an accepted guardian of a given owner
CREATE OR REPLACE FUNCTION public.is_guardian_of(check_owner_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_guardian fg
    WHERE fg.status = 'accepted'
      AND fg.guardian_user_id = auth.uid()
      AND fg.owner_user_id = check_owner_id
  )
$$;

-- ============================================================
-- 1. DANCE TABLE — allow guardian UPDATE
-- ============================================================

DROP POLICY IF EXISTS dance_update ON dance;
CREATE POLICY dance_update ON dance FOR UPDATE TO public
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = dance.owner_id
    )
  )
  WITH CHECK (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = dance.owner_id
    )
  );

-- ============================================================
-- 2. FILE_METADATA TABLE — guardian access
-- ============================================================

DROP POLICY IF EXISTS file_metadata_select ON file_metadata;
CREATE POLICY file_metadata_select ON file_metadata FOR SELECT TO public
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = file_metadata.owner_id
    )
  );

DROP POLICY IF EXISTS file_metadata_insert ON file_metadata;
CREATE POLICY file_metadata_insert ON file_metadata FOR INSERT TO public
  WITH CHECK (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = file_metadata.owner_id
    )
  );

DROP POLICY IF EXISTS file_metadata_update ON file_metadata;
CREATE POLICY file_metadata_update ON file_metadata FOR UPDATE TO public
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = file_metadata.owner_id
    )
  )
  WITH CHECK (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = file_metadata.owner_id
    )
  );

DROP POLICY IF EXISTS file_metadata_delete ON file_metadata;
CREATE POLICY file_metadata_delete ON file_metadata FOR DELETE TO public
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM family_guardian fg
      WHERE fg.status = 'accepted'
        AND fg.guardian_user_id = (select auth.uid())
        AND fg.owner_user_id = file_metadata.owner_id
    )
  );

-- ============================================================
-- 3. STORAGE OBJECTS — guardian access to owner's folder
-- ============================================================

DROP POLICY IF EXISTS dance_files_user_select ON storage.objects;
CREATE POLICY dance_files_user_select ON storage.objects FOR SELECT TO public
  USING (
    bucket_id = 'dance-files'
    AND split_part(name, '/', 1) = 'users'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR public.is_guardian_of(split_part(name, '/', 2)::uuid)
    )
  );

DROP POLICY IF EXISTS dance_files_user_insert ON storage.objects;
CREATE POLICY dance_files_user_insert ON storage.objects FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'dance-files'
    AND split_part(name, '/', 1) = 'users'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR public.is_guardian_of(split_part(name, '/', 2)::uuid)
    )
  );

DROP POLICY IF EXISTS dance_files_user_update ON storage.objects;
CREATE POLICY dance_files_user_update ON storage.objects FOR UPDATE TO public
  USING (
    bucket_id = 'dance-files'
    AND split_part(name, '/', 1) = 'users'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR public.is_guardian_of(split_part(name, '/', 2)::uuid)
    )
  )
  WITH CHECK (
    bucket_id = 'dance-files'
    AND split_part(name, '/', 1) = 'users'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR public.is_guardian_of(split_part(name, '/', 2)::uuid)
    )
  );

DROP POLICY IF EXISTS dance_files_user_delete ON storage.objects;
CREATE POLICY dance_files_user_delete ON storage.objects FOR DELETE TO public
  USING (
    bucket_id = 'dance-files'
    AND split_part(name, '/', 1) = 'users'
    AND (
      split_part(name, '/', 2) = auth.uid()::text
      OR public.is_guardian_of(split_part(name, '/', 2)::uuid)
    )
  );

COMMIT;
