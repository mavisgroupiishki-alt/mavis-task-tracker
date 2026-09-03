alter table if exists project_stages add column if not exists archived boolean default false;
alter table if exists project_stages add column if not exists archived_at timestamptz;
alter table if exists project_stages add column if not exists backlog boolean default false;
alter table if exists project_stages add column if not exists backlog_at timestamptz;
