alter table public.dancer_journey_event
  add column if not exists routine_id uuid references public.routine(id) on delete set null;

create index if not exists dancer_journey_event_routine_id_idx
  on public.dancer_journey_event (routine_id);
