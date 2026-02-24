ALTER TABLE public.session
  ADD COLUMN IF NOT EXISTS session_start_time TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS session_end_time TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_session_session_start_time ON public.session (session_start_time);
