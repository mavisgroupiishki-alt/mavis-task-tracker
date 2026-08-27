-- MAVIS Task Tracker 6.2.3 — отдельный Бэклог
-- Безопасная добавочная миграция: ничего не удаляет и не меняет существующие данные.

begin;

alter table public.projects
  add column if not exists backlog boolean not null default false;

alter table public.projects
  add column if not exists backlog_at timestamptz;

alter table public.tasks
  add column if not exists backlog boolean not null default false;

alter table public.tasks
  add column if not exists backlog_at timestamptz;

update public.projects set backlog = false where backlog is null;
update public.tasks set backlog = false where backlog is null;

create index if not exists projects_backlog_idx on public.projects(backlog);
create index if not exists tasks_backlog_idx on public.tasks(backlog);

commit;

-- Проверка: должны вернуться 4 строки.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'projects' and column_name in ('backlog', 'backlog_at'))
    or
    (table_name = 'tasks' and column_name in ('backlog', 'backlog_at'))
  )
order by table_name, column_name;
