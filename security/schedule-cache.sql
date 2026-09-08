begin;
create table if not exists starosta_private.schedule_cache (
  id integer primary key check (id=1),
  json jsonb,
  fetched_at timestamptz,
  content_hash text,
  changed_at timestamptz,
  last_attempt_at timestamptz,
  request_token uuid,
  last_error text,
  attempt_count bigint not null default 0
);
alter table starosta_private.schedule_cache enable row level security;
revoke all on starosta_private.schedule_cache from public,anon,authenticated;
insert into starosta_private.schedule_cache(id) values(1) on conflict do nothing;

create or replace function public.claim_schedule_refresh() returns jsonb
language plpgsql security definer set search_path='' as $$
declare item starosta_private.schedule_cache%rowtype; acquired boolean;
begin
  update starosta_private.schedule_cache
  set last_attempt_at=clock_timestamp(),request_token=gen_random_uuid(),attempt_count=attempt_count+1
  where id=1 and (last_attempt_at is null or last_attempt_at <= clock_timestamp()-interval '60 seconds')
  returning * into item;
  acquired:=found;
  if not acquired then select * into item from starosta_private.schedule_cache where id=1; end if;
  return jsonb_build_object('acquired',acquired,'cache',to_jsonb(item));
end $$;

create or replace function public.finish_schedule_refresh(lease uuid, snapshot jsonb default null, failure text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item starosta_private.schedule_cache%rowtype; new_hash text; changed boolean:=false;
begin
  select * into item from starosta_private.schedule_cache where id=1 for update;
  if item.request_token is distinct from lease then
    return jsonb_build_object('changed',false,'superseded',true,'cache',to_jsonb(item));
  end if;
  if failure is not null then
    update starosta_private.schedule_cache set last_error=left(failure,500) where id=1 returning * into item;
  else
    if snapshot is null or snapshot->>'group' is distinct from 'О-26-ИСТ-сии-Б'
      or jsonb_typeof(snapshot->'lessons') is distinct from 'array'
      or jsonb_array_length(snapshot->'lessons')<1 then
      raise exception 'Invalid schedule snapshot';
    end if;
    new_hash:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
    changed:=new_hash is distinct from item.content_hash;
    update starosta_private.schedule_cache
    set json=case when changed then snapshot else json end,
        content_hash=new_hash, fetched_at=clock_timestamp(),last_error=null,
        changed_at=case when changed then clock_timestamp() else changed_at end
    where id=1 returning * into item;
  end if;
  return jsonb_build_object('changed',changed,'cache',to_jsonb(item));
end $$;
revoke all on function public.claim_schedule_refresh() from public,anon,authenticated;
revoke all on function public.finish_schedule_refresh(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_schedule_refresh() to service_role;
grant execute on function public.finish_schedule_refresh(uuid,jsonb,text) to service_role;
commit;
