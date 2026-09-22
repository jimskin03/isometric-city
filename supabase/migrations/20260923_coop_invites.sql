-- Co-op invite persistence.
-- Invite codes are capability tokens: a guest that presents a valid code may
-- build inside the shared Paradise City session. They must survive serverless
-- instances and process restarts, so the authoritative copy lives here instead
-- of in process memory. The API keeps an in-process cache for the hot path and
-- still works (with degraded durability) if this migration has not been applied.

create table if not exists public.coop_invites (
  code text primary key,
  user_id uuid null,
  user_display_name text not null default 'Paradise Host',
  session_id text null,
  room_code text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists coop_invites_user_id_idx
  on public.coop_invites (user_id, created_at desc);

create index if not exists coop_invites_expires_at_idx
  on public.coop_invites (expires_at);

alter table public.coop_invites enable row level security;

-- Invite codes are shared capabilities: the host hands the code to a guest or an
-- agent that has no Supabase session, so reads/writes must work with the public
-- publishable key, matching the existing game_rooms capability model.
drop policy if exists "Paradise coop invites" on public.coop_invites;
create policy "Paradise coop invites"
  on public.coop_invites for all
  using (true)
  with check (true);

-- Expired codes are unusable; delete them opportunistically so the table stays
-- small without needing a scheduled job.
create or replace function public.prune_expired_coop_invites()
returns integer
language plpgsql
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.coop_invites where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;