alter table public.dancer_journey_event
  add column if not exists rehearsal_video_key text not null default '',
  add column if not exists rehearsal_video_name text not null default '',
  add column if not exists no_video_taken boolean not null default false,
  add column if not exists no_video_taken_at timestamptz,
  add column if not exists live_sync_offset_ms integer not null default 0,
  add column if not exists live_sync_confidence double precision,
  add column if not exists dancer_reflection jsonb not null default '{"feeling":"","note":"","goals":[]}'::jsonb,
  add column if not exists video_annotations jsonb not null default '[]'::jsonb;
