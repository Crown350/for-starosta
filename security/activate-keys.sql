-- ВЫПОЛНЕНО 2026-09-08, повторный запуск откатит активные ключи на старые — не запускать.
-- Rotation 2026-09-08. Only hashes are committed; plaintext keys are delivered privately.
begin;
update starosta_private.keys set active=false;
insert into starosta_private.keys(label,key_hash,active) values
('староста','ed08efb031b7710a399f02fde21a88dccb4ba0a54d0046c696d5171ed5a58d10',true),
('заместитель','b8f5d007737f5a27f27d1bcda5001bbcda1c199fa6d9fff8cc4925cf1b36f768',true)
on conflict(label) do update set key_hash=excluded.key_hash,active=true;
commit;
