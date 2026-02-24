ALTER TABLE public.session
  ADD COLUMN IF NOT EXISTS session_time TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS session_with TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_session_session_time ON public.session (session_time);