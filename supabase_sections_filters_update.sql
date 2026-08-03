-- MAVIS Task Tracker: разделы задач и заказчик проекта
-- БЕЗОПАСНАЯ МИГРАЦИЯ: не удаляет и не перезаписывает существующие проекты, этапы и задачи.
-- Выполнить один раз в Supabase → SQL Editor → New query → Run.

create extension if not exists "pgcrypto";

-- 1. Сохраняем существующее поле ответственного и добавляем заказчика проекта.
alter table public.projects
  add column if not exists owner text not null default 'Саша';

alter table public.projects
  add column if not exists customer text not null default '';

-- 2. Создаём отдельные разделы для регулярных/операционных задач вне проектов.
create table if not exists public.task_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner text not null default 'Саша',
  color text not null default '#0f766e',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Используем уже существующую функцию set_updated_at, если она была создана предыдущей миграцией.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists task_sections_set_updated_at on public.task_sections;
create trigger task_sections_set_updated_at
before update on public.task_sections
for each row execute function public.set_updated_at();

-- 3. Добавляем к задачам необязательную привязку к разделу.
-- Все существующие задачи остаются на месте: section_id будет NULL.
alter table public.tasks
  add column if not exists section_id uuid references public.task_sections(id) on delete set null;

create index if not exists task_sections_owner_idx on public.task_sections(owner);
create index if not exists tasks_section_idx on public.tasks(section_id);
create index if not exists projects_customer_idx on public.projects(customer);

-- 4. Политики доступа в текущей модели приложения.
alter table public.task_sections enable row level security;

drop policy if exists "allow_read_task_sections" on public.task_sections;
create policy "allow_read_task_sections" on public.task_sections
for select using (true);

drop policy if exists "allow_insert_task_sections" on public.task_sections;
create policy "allow_insert_task_sections" on public.task_sections
for insert with check (true);

drop policy if exists "allow_update_task_sections" on public.task_sections;
create policy "allow_update_task_sections" on public.task_sections
for update using (true) with check (true);

drop policy if exists "allow_delete_task_sections" on public.task_sections;
create policy "allow_delete_task_sections" on public.task_sections
for delete using (true);

-- Просим REST API Supabase сразу перечитать схему.
notify pgrst, 'reload schema';

-- Контроль: показывает количество данных после миграции.
select
  (select count(*) from public.projects) as projects_preserved,
  (select count(*) from public.project_stages) as stages_preserved,
  (select count(*) from public.tasks) as tasks_preserved,
  (select count(*) from public.task_sections) as sections_created,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'customer'
  ) as customer_column_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'section_id'
  ) as section_column_ready;
