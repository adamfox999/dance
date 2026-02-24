BEGIN;

-- Restrict share-recipient media visibility to files explicitly linked to a shared routine.
-- Owner and guardian visibility remains unchanged.

DROP POLICY IF EXISTS file_metadata_select ON public.file_metadata;
DROP POLICY IF EXISTS file_metadata_select_share ON public.file_metadata;
CREATE POLICY file_metadata_select ON public.file_metadata
FOR SELECT TO public
USING (
  owner_id = (select auth.uid())
  OR public.is_guardian_of(owner_id)
  OR (
    COALESCE(meta_data->>'routineId', meta_data->>'routine_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND public.is_share_recipient_for_routine(
      owner_id,
      COALESCE(meta_data->>'routineId', meta_data->>'routine_id')::uuid
    )
  )
);

DROP POLICY IF EXISTS dance_files_user_select ON storage.objects;
DROP POLICY IF EXISTS dance_files_user_select_share ON storage.objects;
CREATE POLICY dance_files_user_select ON storage.objects
FOR SELECT TO public
USING (
  bucket_id = 'dance-files'
  AND split_part(name, '/', 1) = 'users'
  AND (
    split_part(name, '/', 2) = (select auth.uid())::text
    OR (
      split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND public.is_guardian_of(split_part(name, '/', 2)::uuid)
    )
    OR EXISTS (
      SELECT 1
      FROM public.file_metadata fm
      WHERE fm.owner_id = split_part(storage.objects.name, '/', 2)::uuid
        AND fm.meta_data->>'storagePath' = storage.objects.name
        AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND public.is_share_recipient_for_routine(
          fm.owner_id,
          COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id')::uuid
        )
    )
  )
);

COMMIT;
