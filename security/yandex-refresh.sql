begin;
alter table starosta_private.schedule_cache add column if not exists refresh_until timestamptz;
alter table starosta_private.schedule_cache add column if not exists last_attempt_source text;
alter table starosta_private.schedule_cache add column if not exists last_trigger_id text;

create or replace function public.claim_yandex_schedule(origin text default 'http', trigger_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item starosta_private.schedule_cache%rowtype; acquired boolean;
begin
  update starosta_private.schedule_cache
  set last_attempt_at=clock_timestamp(),request_token=gen_random_uuid(),
      refresh_until=clock_timestamp()+interval '7 minutes',attempt_count=attempt_count+1,
      last_attempt_source=case when origin='timer' then 'timer' else 'http' end,last_trigger_id=left(trigger_id,100)
  where id=1 and (last_attempt_at is null or last_attempt_at<=clock_timestamp()-interval '60 seconds')
    and (refresh_until is null or refresh_until<=clock_timestamp())
  returning * into item;
  acquired:=found;
  if not acquired then select * into item from starosta_private.schedule_cache where id=1; end if;
  return jsonb_build_object('acquired',acquired,'cache',to_jsonb(item));
end $$;

create or replace function public.finish_yandex_schedule(lease uuid,snapshot jsonb default null,failure text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item starosta_private.schedule_cache%rowtype; saved jsonb;
begin
  select * into item from starosta_private.schedule_cache where id=1 for update;
  if item.request_token is distinct from lease or item.refresh_until is null then
    return jsonb_build_object('changed',false,'superseded',true,'cache',to_jsonb(item));
  end if;
  if failure is null then
    saved:=public.publish_schedule_snapshot(snapshot);
  end if;
  update starosta_private.schedule_cache set refresh_until=null,last_error=left(failure,500)
    where id=1 returning * into item;
  return jsonb_build_object('changed',coalesce((saved->>'changed')::boolean,false),'cache',to_jsonb(item));
end $$;
revoke all on function public.claim_yandex_schedule(text,text) from public,anon,authenticated;
revoke all on function public.finish_yandex_schedule(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_yandex_schedule(text,text) to service_role;
grant execute on function public.finish_yandex_schedule(uuid,jsonb,text) to service_role;
commit;
