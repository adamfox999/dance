BEGIN;

-- Backfill routine linkage on existing media metadata using only high-confidence sources.
-- We only update rows where routine metadata is missing.

-- 1) Routine cover images: routine-covers/{routine_id}/... in id or storagePath
UPDATE public.file_metadata fm
SET meta_data = jsonb_set(
  jsonb_set(
    fm.meta_data,
    '{routineId}',
    to_jsonb(r.id::text),
    true
  ),
  '{routine_id}',
  to_jsonb(r.id::text),
  true
)
FROM public.routine r
WHERE fm.owner_id = r.owner_id
  AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = ''
  AND (
    r.id::text = substring(fm.id from '^routine-covers/([0-9a-fA-F-]{36})/')
    OR r.id::text = substring(COALESCE(fm.meta_data->>'storagePath', '') from '^users/[^/]+/files/routine-covers/([0-9a-fA-F-]{36})/')
  );

-- 2) Practice videos: match by video_key
UPDATE public.file_metadata fm
SET meta_data = jsonb_set(
  jsonb_set(
    fm.meta_data,
    '{routineId}',
    to_jsonb(pv.routine_id::text),
    true
  ),
  '{routine_id}',
  to_jsonb(pv.routine_id::text),
  true
)
FROM public.practice_video pv
WHERE fm.owner_id = pv.owner_id
  AND pv.routine_id IS NOT NULL
  AND pv.video_key IS NOT NULL
  AND pv.video_key <> ''
  AND fm.id = pv.video_key
  AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = '';

-- 3) Session rehearsal videos: match by rehearsal_video_key and add sessionId
UPDATE public.file_metadata fm
SET meta_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      fm.meta_data,
      '{routineId}',
      to_jsonb(s.routine_id::text),
      true
    ),
    '{routine_id}',
    to_jsonb(s.routine_id::text),
    true
  ),
  '{sessionId}',
  to_jsonb(s.id::text),
  true
)
FROM public.session s
WHERE fm.owner_id = s.owner_id
  AND s.routine_id IS NOT NULL
  AND s.rehearsal_video_key IS NOT NULL
  AND s.rehearsal_video_key <> ''
  AND fm.id = s.rehearsal_video_key
  AND COALESCE(fm.meta_data->>'routineId', fm.meta_data->>'routine_id', '') = '';

COMMIT;
