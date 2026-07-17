-- FORKUSLUGI
-- Схема новых таблиц. Таблица users уже существует (общая с F-BANK), не пересоздаётся.
-- Выполнить в Supabase SQL Editor.

-- ==================== ПРОФЕССИИ ====================
create table if not exists professions (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  salary numeric not null default 0,
  max_employees integer not null default 0, -- 0 = без ограничений
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Текущая профессия гражданина хранится прямо в users, чтобы не плодить джойны
alter table users add column if not exists profession_id bigint references professions(id);
alter table users add column if not exists salary numeric default 0;

-- ==================== ЗАЯВКИ НА РАБОТУ / УВОЛЬНЕНИЕ ====================
create table if not exists job_applications (
  id bigint generated always as identity primary key,
  username text not null,
  profession_id bigint references professions(id),
  type text not null default 'hire', -- 'hire' | 'fire'
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now()
);

-- ==================== ИМУЩЕСТВО (недвижимость / транспорт / бизнес) ====================
create table if not exists properties (
  id bigint generated always as identity primary key,
  owner_username text not null,
  category text not null, -- 'realty' | 'transport' | 'business'
  title text not null,
  description text default '',
  address text default '',
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now()
);

-- Заявки на передачу имущества другому владельцу
create table if not exists property_transfers (
  id bigint generated always as identity primary key,
  property_id bigint references properties(id) on delete cascade,
  from_username text not null,
  to_username text not null,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz not null default now()
);

-- ==================== НАЛОГИ ====================
create table if not exists taxes (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  amount numeric not null default 0,
  recipient_username text not null,
  due_date date,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ==================== ШТРАФЫ ====================
create table if not exists fines (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  amount numeric not null default 0,
  recipient_username text not null,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- ==================== НОВОСТИ ====================
create table if not exists news (
  id bigint generated always as identity primary key,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- ==================== УВЕДОМЛЕНИЯ ====================
create table if not exists notifications (
  id bigint generated always as identity primary key,
  username text not null,
  title text not null,
  message text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ==================== ГОЛОСОВАНИЯ ====================
create table if not exists votes (
  id bigint generated always as identity primary key,
  title text not null,
  description text default '',
  option1 text not null,
  option2 text not null,
  option3 text, -- необязательный третий вариант
  active boolean not null default true,
  winner_option text, -- заполняется администратором при завершении
  created_at timestamptz not null default now()
);

create table if not exists vote_records (
  id bigint generated always as identity primary key,
  vote_id bigint references votes(id) on delete cascade,
  username text not null,
  option_chosen text not null,
  created_at timestamptz not null default now(),
  unique (vote_id, username)
);

-- ==================== ОБРАЩЕНИЯ ====================
create table if not exists appeals (
  id bigint generated always as identity primary key,
  username text not null,
  message text not null,
  admin_reply text,
  status text not null default 'pending', -- 'pending' | 'closed'
  created_at timestamptz not null default now()
);

-- ==================== REALTIME ====================
-- Безопасный вариант: не упадёт, даже если скрипт запустят повторно
-- или если какая-то таблица уже была добавлена в publication ранее.
do $$
declare
  tbl text;
  tables text[] := array[
    'professions',
    'job_applications',
    'properties',
    'property_transfers',
    'taxes',
    'fines',
    'news',
    'notifications',
    'votes',
    'vote_records',
    'appeals',
    'users'
  ];
begin
  foreach tbl in array tables loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table %I', tbl);
    end if;
  end loop;
end $$;

