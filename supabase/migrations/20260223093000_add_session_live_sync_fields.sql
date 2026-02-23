ALTER TABLE public.session
  ADD COLUMN IF NOT EXISTS live_sync_offset_ms INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_sync_confidence DOUBLE PRECISION;

UPDATE public.session s
SET
  live_sync_offset_ms = cv.video_sync_offset,
  live_sync_confidence = cv.video_sync_confidence
FROM public.choreography_version cv
WHERE s.choreography_version_id = cv.id
  AND s.live_sync_offset_ms = 0
  AND s.live_sync_confidence IS NULL;
