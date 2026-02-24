BEGIN;

-- Backfill routine linkage for legacy choreography media metadata.
-- This enables share-recipient access under media-share RLS hardening.

-- 1) If the key is already routine-scoped (choreo-music-<uuid> / choreo-video-<uuid>),
--    copy the routine UUID from the key into metadata when missing.
UPDATE public.file_metadata fm
SET meta_data = jsonb_set(
  jsonb_set(
    fm.meta_data,
    '{routineId}',
    to_jsonb(substring(fm.id from '^choreo-(?:music|video)-([0-9a-fA-F-]{36})$')),
    true
  ),
  '{routine_id}',
  to_jsonb(substring(fm.id from '^choreo-(?:music|video)-([0-9a-fA-F-]{36})$')),
  true
)
WHERE COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = ''
  AND substring(fm.id from '^choreo-(?:music|video)-([0-9a-fA-F-]{36})$') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

-- 2) Legacy global key 'choreo-music': infer routine from unique music_file_name match.
WITH inferred_music AS (
  SELECT
    fm.owner_id,
    fm.id,
    MIN(cv.routine_id::text) AS routine_id_text
  FROM public.file_metadata fm
  JOIN public.choreography_version cv
    ON cv.owner_id = fm.owner_id
   AND cv.routine_id IS NOT NULL
  WHERE fm.id = 'choreo-music'
    AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = ''
    AND NULLIF(COALESCE(fm.meta_data->>'fileName', fm.meta_data->>'originalFileName', ''), '') IS NOT NULL
    AND cv.music_file_name = COALESCE(fm.meta_data->>'fileName', fm.meta_data->>'originalFileName')
  GROUP BY fm.owner_id, fm.id
  HAVING COUNT(DISTINCT cv.routine_id) = 1
)
UPDATE public.file_metadata fm
SET meta_data = jsonb_set(
  jsonb_set(
    fm.meta_data,
    '{routineId}',
    to_jsonb(im.routine_id_text),
    true
  ),
  '{routine_id}',
  to_jsonb(im.routine_id_text),
  true
)
FROM inferred_music im
WHERE fm.owner_id = im.owner_id
  AND fm.id = im.id
  AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = '';

-- 3) Legacy global key 'choreo-video': infer routine from unique video_file_name match.
WITH inferred_video AS (
  SELECT
    fm.owner_id,
    fm.id,
    MIN(cv.routine_id::text) AS routine_id_text
  FROM public.file_metadata fm
  JOIN public.choreography_version cv
    ON cv.owner_id = fm.owner_id
   AND cv.routine_id IS NOT NULL
  WHERE fm.id = 'choreo-video'
    AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = ''
    AND NULLIF(COALESCE(fm.meta_data->>'fileName', fm.meta_data->>'originalFileName', ''), '') IS NOT NULL
    AND cv.video_file_name = COALESCE(fm.meta_data->>'fileName', fm.meta_data->>'originalFileName')
  GROUP BY fm.owner_id, fm.id
  HAVING COUNT(DISTINCT cv.routine_id) = 1
)
UPDATE public.file_metadata fm
SET meta_data = jsonb_set(
  jsonb_set(
    fm.meta_data,
    '{routineId}',
    to_jsonb(iv.routine_id_text),
    true
  ),
  '{routine_id}',
  to_jsonb(iv.routine_id_text),
  true
)
FROM inferred_video iv
WHERE fm.owner_id = iv.owner_id
  AND fm.id = iv.id
  AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = '';

COMMIT;
