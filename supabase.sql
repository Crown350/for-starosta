-- Run once in Supabase SQL Editor. This creates an isolated, private journal.
begin;
create schema if not exists starosta_private;
revoke all on schema starosta_private from public, anon, authenticated;
create table if not exists starosta_private.keys (
  label text primary key,
  key_hash text not null,
  active boolean not null default true
);
create table if not exists starosta_private.journal (
  id integer primary key check(id=1),
  revision bigint not null default 0,
  data jsonb,
  updated_at timestamptz not null default now()
);
insert into starosta_private.journal(id) values(1) on conflict do nothing;
alter table starosta_private.keys enable row level security;
alter table starosta_private.journal enable row level security;
revoke all on all tables in schema starosta_private from public, anon, authenticated;

create or replace function public.starosta_state(access_key text, operation text default 'read', expected_revision bigint default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row_data starosta_private.journal%rowtype; k text;
begin
  if access_key is null or length(access_key)<32 or length(access_key)>256 or not exists(
    select 1 from starosta_private.keys where active and key_hash=encode(sha256(convert_to(access_key,'UTF8')),'hex')
  ) then raise sqlstate 'PT401' using message='Неверный или отозванный ключ'; end if;
  if operation='session' then return jsonb_build_object('ok',true,'role','editor'); end if;
  if operation not in ('read','write') then raise sqlstate 'PT400' using message='Неизвестная операция'; end if;
  select * into row_data from starosta_private.journal where id=1 for update;
  if operation='write' then
    if expected_revision is distinct from row_data.revision then raise sqlstate 'PT409' using message='Данные изменились на другом устройстве. Скачайте черновик и загрузите облачную версию.'; end if;
    if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>2097152 or jsonb_typeof(payload->'group') is distinct from 'string' then
      raise sqlstate 'PT400' using message='Неверные данные или размер больше 2 МБ';
    end if;
    foreach k in array array['students','teachers','subjects','lessons','works','funds','tpl'] loop
      if jsonb_typeof(payload->k) is distinct from 'array' then raise sqlstate 'PT400' using message='Неверный список: '||k; end if;
      if exists(select 1 from jsonb_array_elements(payload->k) x where jsonb_typeof(x->'id') is distinct from 'string') then raise sqlstate 'PT400' using message='Отсутствует id'; end if;
    end loop;
    foreach k in array array['att','subs','pays','duty','schedule'] loop
      if jsonb_typeof(payload->k) is distinct from 'object' then raise sqlstate 'PT400' using message='Неверный объект: '||k; end if;
    end loop;
    if jsonb_typeof(payload->'duty'->'log') is distinct from 'array' or jsonb_typeof(payload->'duty'->'idx') is distinct from 'number' then raise sqlstate 'PT400' using message='Неверные дежурства'; end if;
    update starosta_private.journal set data=payload, revision=revision+1, updated_at=now() where id=1 returning * into row_data;
  end if;
  return jsonb_build_object('revision',row_data.revision,'data',row_data.data,'updatedAt',row_data.updated_at);
end $$;
revoke all on function public.starosta_state(text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.starosta_state(text,text,bigint,jsonb) to anon;
commit;

-- Generate two independent keys, shown once in the Results table.
-- Re-running this final statement rotates both keys without deleting the journal.
with generated as (
  select label, replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') as access_key
  from (values ('староста'),('заместитель')) names(label)
), saved as (
  insert into starosta_private.keys(label,key_hash,active)
  select label,encode(sha256(convert_to(access_key,'UTF8')),'hex'),true from generated
  on conflict(label) do update set key_hash=excluded.key_hash,active=true returning label
)
select generated.label,generated.access_key from generated join saved using(label);
