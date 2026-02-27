ALTER TABLE public.session
  ADD COLUMN IF NOT EXISTS no_video_taken boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_video_taken_at timestamptz;

UPDATE public.session
SET no_video_taken = false
WHERE no_video_taken IS NULL;