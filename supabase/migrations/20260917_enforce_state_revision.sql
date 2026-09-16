-- Enforce canonical room-state compare-and-swap at the database boundary.
-- This prevents stale/older clients from changing game_state without advancing
-- the room revision exactly once. Non-state metadata updates remain allowed.

create or replace function public.enforce_game_room_state_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.game_state is distinct from old.game_state then
    if new.state_revision <> old.state_revision + 1 then
      raise exception 'game_state updates must advance state_revision exactly once';
    end if;
  elsif new.state_revision is distinct from old.state_revision then
    raise exception 'state_revision cannot change without game_state';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_game_room_state_revision on public.game_rooms;
create trigger enforce_game_room_state_revision
before update on public.game_rooms
for each row
execute function public.enforce_game_room_state_revision();
