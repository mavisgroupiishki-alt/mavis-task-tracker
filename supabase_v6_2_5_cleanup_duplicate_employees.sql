-- MAVIS Task Tracker 6.2.5
-- Очистка дублей сотрудников по имени + защита от повторного появления.
-- Задачи/проекты не удаляются: ответственные в них хранятся текстом.

begin;

-- Нормализуем пробелы у имён сотрудников.
update public.employees
set name = trim(name)
where name is not null and name <> trim(name);

-- Оставляем одну запись на каждое имя без учёта регистра.
-- Предпочитаем активную запись, затем более раннюю запись.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(name))
      order by coalesce(is_active, true) desc, created_at asc nulls last, id
    ) as rn
  from public.employees
  where nullif(trim(name), '') is not null
)
delete from public.employees e
using ranked r
where e.id = r.id
  and r.rn > 1;

-- Запрещаем будущие дубли одного имени с разным регистром/пробелами.
create unique index if not exists employees_name_unique_ci
  on public.employees ((lower(trim(name))));

commit;

select name, count(*) as records
from public.employees
group by name
order by name;
