-- Canonical shared-session revisions.
-- Only the elected client authority advances this counter; compare-and-swap
-- updates prevent stale peers from overwriting a newer city snapshot.

alter table public.game_rooms
  add column if not exists state_revision bigint not null default 0;

create index if not exists game_rooms_state_revision_idx
  on public.game_rooms (room_code, state_revision);
