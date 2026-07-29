create extension if not exists "pgcrypto";

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner text not null,
  deadline date not null,
  period text not null default 'day',
  status text not null default 'Новая',
  priority text not null default 'Средний',
  hours numeric not null default 1,
  start_time time,
  end_time time,
  block text default '',
  result text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

-- MVP-режим: доступ всем, у кого есть ссылка на приложение.
-- После запуска можно заменить на авторизацию и роли.
drop policy if exists "allow_read_tasks" on public.tasks;
create policy "allow_read_tasks" on public.tasks for select using (true);

drop policy if exists "allow_insert_tasks" on public.tasks;
create policy "allow_insert_tasks" on public.tasks for insert with check (true);

drop policy if exists "allow_update_tasks" on public.tasks;
create policy "allow_update_tasks" on public.tasks for update using (true) with check (true);

drop policy if exists "allow_delete_tasks" on public.tasks;
create policy "allow_delete_tasks" on public.tasks for delete using (true);

-- Сотрудники дашборда
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  role text not null default 'Сотрудник',
  color text not null default '#7c3aed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists employees_set_updated_at on public.employees;
create trigger employees_set_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

insert into public.employees (name, role, color)
values
  ('Саша', 'Руководитель отдела продаж', '#7c3aed'),
  ('Таня', 'Руководитель экспертного отдела', '#0284c7'),
  ('Аня', 'Проекты и автоматизация', '#ea580c'),
  ('Виктория', 'Директор', '#059669')
on conflict (name) do nothing;

alter table public.employees enable row level security;

drop policy if exists "allow_read_employees" on public.employees;
create policy "allow_read_employees" on public.employees for select using (true);

drop policy if exists "allow_insert_employees" on public.employees;
create policy "allow_insert_employees" on public.employees for insert with check (true);

drop policy if exists "allow_update_employees" on public.employees;
create policy "allow_update_employees" on public.employees for update using (true) with check (true);

drop policy if exists "allow_delete_employees" on public.employees;
create policy "allow_delete_employees" on public.employees for delete using (true);
