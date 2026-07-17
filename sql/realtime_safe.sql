-- FORKUSLUGI
-- Безопасное добавление таблиц в publication supabase_realtime.
-- Можно выполнять сколько угодно раз — не упадёт, если таблица уже подключена.

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
