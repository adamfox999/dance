BEGIN;

-- Blob URLs are browser-session local and cannot be reused across users/devices.
-- Clear any stale blob: values persisted historically in choreography versions.
UPDATE public.choreography_version
SET music_url = ''
WHERE music_url IS NOT NULL
  AND music_url LIKE 'blob:%';

COMMIT;
