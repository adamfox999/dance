-- Move to per-user ownership model (fresh start)
-- NOTE: This migration intentionally clears shared data as requested.

-- 1) Dance rows become one-per-user
ALTER TABLE dance ADD COLUMN IF NOT EXISTS owner_id UUID;

TRUNCATE TABLE dance RESTART IDENTITY;

ALTER TABLE dance ALTER COLUMN owner_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dance_owner_id_fkey'
      AND conrelid = 'dance'::regclass
  ) THEN
    ALTER TABLE dance
      ADD CONSTRAINT dance_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dance_owner_id_unique'
      AND conrelid = 'dance'::regclass
  ) THEN
    ALTER TABLE dance ADD CONSTRAINT dance_owner_id_unique UNIQUE (owner_id);
  END IF;
END $$;

-- 2) File metadata becomes owner-scoped keyspace
ALTER TABLE file_metadata ADD COLUMN IF NOT EXISTS owner_id UUID;

TRUNCATE TABLE file_metadata;

ALTER TABLE file_metadata ALTER COLUMN owner_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'file_metadata_owner_id_fkey'
      AND conrelid = 'file_metadata'::regclass
  ) THEN
    ALTER TABLE file_metadata
      ADD CONSTRAINT file_metadata_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE file_metadata DROP CONSTRAINT IF EXISTS file_metadata_pkey;
ALTER TABLE file_metadata ADD CONSTRAINT file_metadata_pkey PRIMARY KEY (owner_id, id);

-- 3) Replace public/open RLS policies with owner-bound rules
-- dance
DROP POLICY IF EXISTS "Allow public read access on dance" ON dance;
DROP POLICY IF EXISTS "Allow public insert access on dance" ON dance;
DROP POLICY IF EXISTS "Allow public update access on dance" ON dance;
DROP POLICY IF EXISTS "Allow public delete access on dance" ON dance;

CREATE POLICY "dance_select_own" ON dance
FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "dance_insert_own" ON dance
FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "dance_update_own" ON dance
FOR UPDATE USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "dance_delete_own" ON dance
FOR DELETE USING (owner_id = auth.uid());

-- file_metadata
DROP POLICY IF EXISTS "Allow public read access on file_metadata" ON file_metadata;
DROP POLICY IF EXISTS "Allow public update access on file_metadata" ON file_metadata;
DROP POLICY IF EXISTS "Allow public insert access on file_metadata" ON file_metadata;
DROP POLICY IF EXISTS "Allow public delete access on file_metadata" ON file_metadata;

CREATE POLICY "file_metadata_select_own" ON file_metadata
FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "file_metadata_insert_own" ON file_metadata
FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "file_metadata_update_own" ON file_metadata
FOR UPDATE USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "file_metadata_delete_own" ON file_metadata
FOR DELETE USING (owner_id = auth.uid());

-- app_state (deprecated): remove public access
DROP POLICY IF EXISTS "Allow public read access" ON app_state;
DROP POLICY IF EXISTS "Allow public update access" ON app_state;
DROP POLICY IF EXISTS "Allow public insert access" ON app_state;

-- 4) Storage bucket policies: private user folders only
DROP POLICY IF EXISTS "dance_files_public_select" ON storage.objects;
DROP POLICY IF EXISTS "dance_files_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "dance_files_public_update" ON storage.objects;
DROP POLICY IF EXISTS "dance_files_public_delete" ON storage.objects;

CREATE POLICY "dance_files_user_select"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'dance-files'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = auth.uid()::text
);

CREATE POLICY "dance_files_user_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'dance-files'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = auth.uid()::text
);

CREATE POLICY "dance_files_user_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'dance-files'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'dance-files'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = auth.uid()::text
);

CREATE POLICY "dance_files_user_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'dance-files'
  AND split_part(name, '/', 1) = 'users'
  AND split_part(name, '/', 2) = auth.uid()::text
);
