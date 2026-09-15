create table public.teachers (
 id uuid primary key default gen_random_uuid(),
 university text not null,
 short_name text not null,
 full_name text not null,
 url text not null,
 unique (university, short_name)
);
alter table public.teachers enable row level security;
revoke all on public.teachers from public, anon, authenticated;
grant select on public.teachers to anon, authenticated;
create policy teachers_public_read on public.teachers for select to anon, authenticated using (true);
insert into public.teachers (university, short_name, full_name, url) values
('bgtu', 'Голоколенов А. В.', 'Голоколенов Антон Викторович', 'https://www.tu-bryansk.ru/sveden/employees/8458'),
('bgtu', 'Гарбузова Г. В.', 'Гарбузова Галина Владимировна', 'https://www.tu-bryansk.ru/sveden/employees/244'),
('bgtu', 'Кобзев В. М.', 'Кобзев Владимир Михайлович', 'https://www.tu-bryansk.ru/sveden/employees/260'),
('bgtu', 'Алейникова А. О.', 'Алейникова Алина Олеговна', 'https://www.tu-bryansk.ru/sveden/employees/262'),
('bgtu', 'Ракова К. А.', 'Ракова Ксения Александровна', 'https://www.tu-bryansk.ru/sveden/employees/264'),
('bgtu', 'Власенков А. Н.', 'Власенков Андрей Николаевич', 'https://www.tu-bryansk.ru/sveden/employees/12852'),
('bgtu', 'Ефремов Д. А.', 'Ефремов Дмитрий Александрович', 'https://www.tu-bryansk.ru/sveden/employees/12838'),
('bgtu', 'Вдовиченко О. А.', 'Вдовиченко Олег Антонович', 'https://www.tu-bryansk.ru/sveden/employees/686'),
('bgtu', 'Атаманова Н. В.', 'Атаманова Наталья Викторовна', 'https://www.tu-bryansk.ru/sveden/employees/15324'),
('bgtu', 'Манкевич И. Г.', 'Манкевич Игорь Геннадьевич', 'https://www.tu-bryansk.ru/sveden/employees/386'),
('bgtu', 'Хохлова М. В.', 'Хохлова Марина Витальевна', 'https://www.tu-bryansk.ru/sveden/employees/248');
