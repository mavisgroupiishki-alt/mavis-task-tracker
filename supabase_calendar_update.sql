-- Обновление базы для календарного отображения и импорта Excel-расписания
alter table public.tasks add column if not exists start_time time;
alter table public.tasks add column if not exists end_time time;
alter table public.tasks add column if not exists block text default '';

-- Оставляем только участников нового формата.
-- Старые задачи с другими ответственными будут перенесены на Алису.
update public.tasks
set owner = 'Алиса'
where owner not in ('Алиса', 'Таня', 'Аня', 'Виктория');
