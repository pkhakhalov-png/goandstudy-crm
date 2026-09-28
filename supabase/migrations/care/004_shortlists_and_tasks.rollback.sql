-- Откат 004. Снимает требования, подборки, заявки и задачи.
-- Рабочие таблицы не затрагиваются: миграция 004 их не меняла.

begin;

drop table if exists care.tasks cascade;
drop table if exists care.applications cascade;
drop table if exists care.shortlist_items cascade;
drop table if exists care.shortlists cascade;
drop table if exists care.program_requirements cascade;

commit;
