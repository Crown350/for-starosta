begin;
drop function if exists public.claim_schedule_refresh();
drop function if exists public.finish_schedule_refresh(uuid,jsonb,text);
create or replace function public.read_schedule_cache() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('json',json,'fetched_at',fetched_at,'content_hash',content_hash,'changed_at',changed_at)
  from starosta_private.schedule_cache where id=1;
$$;
create or replace function public.publish_schedule_snapshot(snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item starosta_private.schedule_cache%rowtype; payload jsonb; stamp timestamptz; hash text; changed boolean;
begin
  if snapshot->>'ok' is distinct from 'true' or coalesce(snapshot->>'mock','false')<>'false'
    or lower(snapshot->>'group') is distinct from 'о-26-ист-сии-б'
    or jsonb_typeof(snapshot->'lessons') is distinct from 'array' then
    raise exception 'Invalid snapshot';
  end if;
  if jsonb_array_length(snapshot->'lessons') not between 10 and 200 then raise exception 'Invalid lessons'; end if;
  stamp:=(snapshot->>'fetchedAt')::timestamptz;
  if stamp is null or stamp>clock_timestamp()+interval '5 minutes' then raise exception 'Invalid timestamp'; end if;
  payload:=snapshot-'fetchedAt'-'cached'-'mock';
  hash:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  select * into item from starosta_private.schedule_cache where id=1 for update;
  if item.fetched_at is not null and stamp<=item.fetched_at then
    return jsonb_build_object('ok',true,'changed',false,'ignored',true);
  end if;
  changed:=hash is distinct from item.content_hash;
  update starosta_private.schedule_cache set json=case when changed then payload else json end,
    content_hash=hash,fetched_at=stamp,changed_at=case when changed then stamp else changed_at end,last_error=null
  where id=1;
  return jsonb_build_object('ok',true,'changed',changed,'lessons',jsonb_array_length(payload->'lessons'),'fetchedAt',stamp);
end $$;
revoke all on function public.read_schedule_cache() from public,anon,authenticated;
revoke all on function public.publish_schedule_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.read_schedule_cache() to service_role;
grant execute on function public.publish_schedule_snapshot(jsonb) to service_role;
commit;
