-- MAVIS Task Tracker 6.2.6
-- Нормализация существующих проектов в бэклоге.
-- Ничего не удаляет. Нужна один раз перед/после обновления приложения.
-- До версии 6.2.6 проект мог быть в бэклоге, а его задачи иметь backlog=false.
-- Новая логика использует task.backlog=false как явный признак "вернуть только эту задачу в работу".
-- Поэтому старые задачи внутри уже существующих backlog-проектов один раз синхронизируем с проектом.

begin;

update public.tasks t
set
  backlog = true,
  backlog_at = coalesce(t.backlog_at, p.backlog_at, now())
from public.projects p
where t.project_id = p.id
  and coalesce(p.backlog, false) = true
  and coalesce(t.backlog, false) = false;

commit;

select
  count(*) filter (where coalesce(p.backlog, false) = true) as tasks_inside_backlog_projects,
  count(*) filter (where coalesce(p.backlog, false) = true and coalesce(t.backlog, false) = true) as correctly_in_backlog,
  count(*) filter (where coalesce(p.backlog, false) = true and coalesce(t.backlog, false) = false) as individually_in_work
from public.tasks t
join public.projects p on p.id = t.project_id;
