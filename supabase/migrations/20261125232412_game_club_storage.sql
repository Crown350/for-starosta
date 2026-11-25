create schema starosta_club;
revoke all on schema starosta_club from public, anon, authenticated;
grant usage on schema starosta_club to service_role;

create table starosta_club.state (
  club_id text primary key check (club_id ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 0 check (revision >= 0),
  game jsonb not null default '{"version":1,"users":{},"events":{}}',
  rate jsonb not null default '{}'
);

alter table starosta_club.state enable row level security;
revoke all on starosta_club.state from public, anon, authenticated;
grant select, insert, update on starosta_club.state to service_role;

create function public.starosta_club_read(club text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  insert into starosta_club.state (club_id) values (club)
    on conflict (club_id) do nothing;
  return (select pg_catalog.jsonb_build_object(
    'revision', s.revision, 'state', s.game, 'rate', s.rate
  ) from starosta_club.state as s where s.club_id = club);
end;
$$;

create function public.starosta_club_commit(club text, previous bigint, game_state jsonb, rate_state jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update starosta_club.state
     set revision = revision + 1, game = game_state, rate = rate_state
   where club_id = club and revision = previous;
  return found;
end;
$$;

revoke all on function public.starosta_club_read(text),
  public.starosta_club_commit(text, bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.starosta_club_read(text),
  public.starosta_club_commit(text, bigint, jsonb, jsonb) to service_role;
