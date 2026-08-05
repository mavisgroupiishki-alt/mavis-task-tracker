-- MAVIS Task Tracker 6.1
-- Аня входит как администратор по паролю.
-- Остальные сотрудники выбирают своё имя без пароля.
-- Скрипт исправляет ошибку "permission denied for table tasks" после версии 6.0.
-- Данные проектов, этапов, задач, разделов и истории НЕ удаляются.

create extension if not exists "pgcrypto";

-- 1. Поля команды, необходимые для отображения загрузки и отключения сотрудника.
alter table public.employees
  add column if not exists task_capacity integer not null default 10;

alter table public.employees
  add column if not exists is_active boolean not null default true;

update public.employees
set task_capacity = 10
where task_capacity is null or task_capacity < 1;

update public.employees
set is_active = true
where is_active is null;

-- Аня должна существовать в списке сотрудников.
insert into public.employees (name, role, color, task_capacity, is_active)
select 'Аня', 'Администратор проектов и автоматизации', '#E4C1F9', 12, true
where not exists (
  select 1 from public.employees where lower(trim(name)) = lower('Аня')
);

-- 2. Проверка прав администратора по техническому email Supabase Auth.
-- В Authentication должен быть создан пользователь anya@mavis.local.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('anya@mavis.local');
$$;

-- 3. Безопасный список сотрудников для экрана выбора имени.
-- Обычный вход видит только активных сотрудников, Аня видит также отключённых.
create or replace function public.list_app_employees()
returns table (
  id uuid,
  name text,
  role text,
  color text,
  task_capacity integer,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.name,
    e.role,
    e.color,
    greatest(coalesce(e.task_capacity, 10), 1),
    coalesce(e.is_active, true),
    e.created_at
  from public.employees e
  where coalesce(e.is_active, true) = true
     or public.is_app_admin()
  order by e.name;
$$;

-- 4. Административное сохранение сотрудника с переносом имени во все связанные записи.
create or replace function public.admin_save_employee(
  p_employee_id uuid,
  p_name text,
  p_role text,
  p_color text,
  p_task_capacity integer,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old_name text;
  v_name text := trim(coalesce(p_name, ''));
  v_role text := trim(coalesce(p_role, ''));
begin
  if not public.is_app_admin() then
    raise exception 'Только Аня может изменять команду';
  end if;

  if v_name = '' then
    raise exception 'Имя сотрудника не указано';
  end if;

  if exists (
    select 1
    from public.employees e
    where lower(trim(e.name)) = lower(v_name)
      and (p_employee_id is null or e.id <> p_employee_id)
  ) then
    raise exception 'Сотрудник с таким именем уже существует';
  end if;

  if p_employee_id is null then
    insert into public.employees (name, role, color, task_capacity, is_active)
    values (
      v_name,
      coalesce(nullif(v_role, ''), 'Сотрудник'),
      coalesce(nullif(trim(p_color), ''), '#D8E4FF'),
      greatest(coalesce(p_task_capacity, 10), 1),
      coalesce(p_is_active, true)
    )
    returning id into v_id;
  else
    select name into v_old_name
    from public.employees
    where id = p_employee_id;

    if v_old_name is null then
      raise exception 'Сотрудник не найден';
    end if;

    update public.employees
    set
      name = v_name,
      role = coalesce(nullif(v_role, ''), 'Сотрудник'),
      color = coalesce(nullif(trim(p_color), ''), color),
      task_capacity = greatest(coalesce(p_task_capacity, task_capacity, 10), 1),
      is_active = coalesce(p_is_active, true)
    where id = p_employee_id
    returning id into v_id;

    if v_old_name <> v_name then
      if to_regclass('public.tasks') is not null then
        execute 'update public.tasks set owner = $1 where owner = $2' using v_name, v_old_name;
      end if;
      if to_regclass('public.projects') is not null then
        execute 'update public.projects set owner = $1 where owner = $2' using v_name, v_old_name;
        if exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'projects' and column_name = 'customer'
        ) then
          execute 'update public.projects set customer = $1 where customer = $2' using v_name, v_old_name;
        end if;
      end if;
      if to_regclass('public.project_stages') is not null then
        execute 'update public.project_stages set owner = $1 where owner = $2' using v_name, v_old_name;
      end if;
      if to_regclass('public.task_sections') is not null then
        execute 'update public.task_sections set owner = $1 where owner = $2' using v_name, v_old_name;
      end if;
      if to_regclass('public.task_reschedules') is not null then
        execute 'update public.task_reschedules set changed_by = $1 where changed_by = $2' using v_name, v_old_name;
      end if;
      if to_regclass('public.project_templates') is not null then
        if exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'project_templates' and column_name = 'owner'
        ) then
          execute 'update public.project_templates set owner = $1 where owner = $2' using v_name, v_old_name;
        end if;
        if exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'project_templates' and column_name = 'customer'
        ) then
          execute 'update public.project_templates set customer = $1 where customer = $2' using v_name, v_old_name;
        end if;
      end if;
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.admin_set_employee_active(
  p_employee_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Только Аня может изменять команду';
  end if;

  update public.employees
  set is_active = coalesce(p_is_active, false)
  where id = p_employee_id;
end;
$$;

-- 5. Полностью пересобираем политики только на таблицах приложения.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'app_users', 'employees', 'task_sections', 'projects',
        'project_stages', 'tasks', 'task_reschedules', 'project_templates'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Сотрудники: приложение получает список через list_app_employees().
alter table public.employees enable row level security;
create policy "employees_admin_select"
on public.employees for select to authenticated
using (public.is_app_admin());

create policy "employees_admin_insert"
on public.employees for insert to authenticated
with check (public.is_app_admin());

create policy "employees_admin_update"
on public.employees for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy "employees_admin_delete"
on public.employees for delete to authenticated
using (public.is_app_admin());

-- Разделы: читать могут все, менять только Аня.
do $$
begin
  if to_regclass('public.task_sections') is not null then
    execute 'alter table public.task_sections enable row level security';
    execute 'create policy "sections_everyone_read" on public.task_sections for select to anon, authenticated using (true)';
    execute 'create policy "sections_admin_insert" on public.task_sections for insert to authenticated with check (public.is_app_admin())';
    execute 'create policy "sections_admin_update" on public.task_sections for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin())';
    execute 'create policy "sections_admin_delete" on public.task_sections for delete to authenticated using (public.is_app_admin())';
  end if;
end $$;

-- Проекты, этапы, задачи, переносы и шаблоны:
-- сотрудники без пароля работают как anon, Аня — как authenticated.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'projects', 'project_stages', 'tasks', 'task_reschedules', 'project_templates'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('create policy %I on public.%I for select to anon, authenticated using (true)', v_table || '_team_select', v_table);
      execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', v_table || '_team_insert', v_table);
      execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', v_table || '_team_update', v_table);
      execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', v_table || '_team_delete', v_table);
    end if;
  end loop;
end $$;

-- app_users от старой версии больше не используется приложением.
do $$
begin
  if to_regclass('public.app_users') is not null then
    execute 'alter table public.app_users enable row level security';
    execute 'create policy "app_users_admin_only" on public.app_users for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin())';
  end if;
end $$;

-- 6. Права PostgREST.
revoke all on public.employees from anon;
grant select, insert, update, delete on public.employees to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'task_sections', 'projects', 'project_stages', 'tasks', 'task_reschedules', 'project_templates'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('grant select, insert, update, delete on public.%I to anon, authenticated', v_table);
    end if;
  end loop;
end $$;

grant execute on function public.is_app_admin() to anon, authenticated;
grant execute on function public.list_app_employees() to anon, authenticated;
grant execute on function public.admin_save_employee(uuid, text, text, text, integer, boolean) to authenticated;
grant execute on function public.admin_set_employee_active(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Проверка результата.
select
  true as employee_choice_ready,
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tasks'
      and policyname = 'tasks_team_select'
  ) as tasks_access_ready,
  exists (
    select 1 from public.employees
    where lower(trim(name)) = lower('Аня')
  ) as anya_employee_ready;
