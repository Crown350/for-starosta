alter table starosta_private.journal drop constraint journal_id_check;
alter table starosta_private.journal add column group_id text not null default 'main' unique;
alter table starosta_private.journal add column use_public_schedule boolean not null default true;
alter table starosta_private.keys add column group_id text not null default 'main' references starosta_private.journal(group_id);
create unique index keys_key_hash_unique on starosta_private.keys(key_hash);
create or replace function public.starosta_state(access_key text, operation text default 'read', expected_revision bigint default null, payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row_data starosta_private.journal%rowtype; k text; target_group text; public_schedule boolean;
begin
  if access_key is null or length(access_key)<32 or length(access_key)>256  then raise sqlstate 'PT401' using message='Неверный или отозванный ключ'; end if;
  select group_id into target_group from starosta_private.keys
    where active and key_hash=encode(sha256(convert_to(access_key,'UTF8')),'hex');
  if not found then raise sqlstate 'PT401' using message='Неверный или отозванный ключ'; end if;
  select use_public_schedule into public_schedule from starosta_private.journal where group_id=target_group;
  if operation='session' then return jsonb_build_object('ok',true,'role','editor','groupId',target_group,'usePublicSchedule',public_schedule); end if;
  if operation not in ('read','write') then raise sqlstate 'PT400' using message='Неизвестная операция'; end if;
  select * into row_data from starosta_private.journal where group_id=target_group for update;
  if operation='write' then
    if expected_revision is distinct from row_data.revision then raise sqlstate 'PT409' using message='Данные изменились на другом устройстве. Скачайте черновик и загрузите облачную версию.'; end if;
    if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>2097152 or jsonb_typeof(payload->'group') is distinct from 'string' then
      raise sqlstate 'PT400' using message='Неверные данные или размер больше 2 МБ';
    end if;
    if payload->>'group' is distinct from row_data.data->>'group' then
      raise sqlstate 'PT403' using message='Ключ не разрешает менять группу журнала';
    end if;
    foreach k in array array['students','teachers','subjects','lessons','works','funds','tpl'] loop
      if jsonb_typeof(payload->k) is distinct from 'array' then raise sqlstate 'PT400' using message='Неверный список: '||k; end if;
      if exists(select 1 from jsonb_array_elements(payload->k) x where jsonb_typeof(x->'id') is distinct from 'string') then raise sqlstate 'PT400' using message='Отсутствует id'; end if;
    end loop;
    foreach k in array array['att','subs','pays','duty','schedule'] loop
      if jsonb_typeof(payload->k) is distinct from 'object' then raise sqlstate 'PT400' using message='Неверный объект: '||k; end if;
    end loop;
    if jsonb_typeof(payload->'duty'->'log') is distinct from 'array' or jsonb_typeof(payload->'duty'->'idx') is distinct from 'number' then raise sqlstate 'PT400' using message='Неверные дежурства'; end if;
    update starosta_private.journal set data=payload, revision=revision+1, updated_at=now() where group_id=target_group returning * into row_data;
  end if;
  return jsonb_build_object('groupId',target_group,'usePublicSchedule',public_schedule,'revision',row_data.revision,'data',row_data.data,'updatedAt',row_data.updated_at);
end $$;

insert into starosta_private.journal(id,group_id,use_public_schedule,data) select coalesce(max(id),0)+1,'test-group',false,'{"v":1,"group":"test-group","students":[{"id":"demo-s0","fio":"Тестов Алексей Примерович","phone":"","tg":"","note":"Вымышленный студент"},{"id":"demo-s1","fio":"Примерова Вера Тестовна","phone":"","tg":"","note":"Вымышленный студент"},{"id":"demo-s2","fio":"Образцов Денис Макетович","phone":"","tg":"","note":"Вымышленный студент"},{"id":"demo-s3","fio":"Условная Нина Демовна","phone":"","tg":"","note":"Вымышленный студент"}],"teachers":[{"id":"demo-t1","fio":"Примеров П. П.","dept":"Тестовая кафедра","contact":"","note":""}],"subjects":[{"id":"demo-p1","name":"Основы макетирования","control":"Зачёт","teacherId":"demo-t1"},{"id":"demo-p2","name":"Практикум интерфейсов","control":"Зачёт","teacherId":"demo-t1"}],"lessons":[{"id":"demo-l0","date":"2026-09-16","pair":1,"subjectId":"demo-p1","teacherId":"demo-t1","kind":"Лекции","time":"08:00 - 09:35","room":"21","week":"odd","source":"manual"},{"id":"demo-l1","date":"2026-09-16","pair":2,"subjectId":"demo-p2","teacherId":"demo-t1","kind":"Практические занятия","time":"09:45 - 11:20","room":"А123","week":"odd","source":"manual"},{"id":"demo-l2","date":"2026-09-17","pair":1,"subjectId":"demo-p1","teacherId":"demo-t1","kind":"Лекции","time":"08:00 - 09:35","room":"21","week":"odd","source":"manual"},{"id":"demo-l3","date":"2026-09-17","pair":2,"subjectId":"demo-p2","teacherId":"demo-t1","kind":"Практические занятия","time":"09:45 - 11:20","room":"А123","week":"odd","source":"manual"}],"att":{"demo-l0":{"demo-s0":"n"},"demo-l1":{"demo-s1":"u"},"demo-l2":{"demo-s2":"n"},"demo-l3":{"demo-s3":"u"}},"works":[],"subs":{},"funds":[],"pays":{},"tpl":[{"id":"demo-x0","date":"2026-09-16","pair":1,"subjectId":"demo-p1","teacherId":"demo-t1","kind":"Лекции","time":"08:00 - 09:35","room":"21","week":"odd","source":"manual","dow":3},{"id":"demo-x1","date":"2026-09-16","pair":2,"subjectId":"demo-p2","teacherId":"demo-t1","kind":"Практические занятия","time":"09:45 - 11:20","room":"А123","week":"odd","source":"manual","dow":3},{"id":"demo-x2","date":"2026-09-17","pair":1,"subjectId":"demo-p1","teacherId":"demo-t1","kind":"Лекции","time":"08:00 - 09:35","room":"21","week":"odd","source":"manual","dow":4},{"id":"demo-x3","date":"2026-09-17","pair":2,"subjectId":"demo-p2","teacherId":"demo-t1","kind":"Практические занятия","time":"09:45 - 11:20","room":"А123","week":"odd","source":"manual","dow":4}],"duty":{"idx":0,"log":[]},"schedule":{"group":"test-group","source":"Тестовые данные","year":"2026-2027","semester":1,"week":"odd"},"limit":3}'::jsonb from starosta_private.journal;
