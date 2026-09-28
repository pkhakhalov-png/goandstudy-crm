-- Откат 006. Снимает приём событий, очередь и планировщик кабинета v2.
--
-- Порядок важен: сначала расписание, потом функции, потом таблицы. Снять
-- таблицы, оставив расписание, значит получить задание cron, падающее каждую
-- минуту в журнал базы.

begin;

-- Расписание снимаем первым и терпимо к тому, что его могло и не быть.
do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'care_tick';
exception when others then
  null;
end $$;

drop function if exists care.dispatch_tick();
drop function if exists care.schedule_all();
drop function if exists care.unschedule_all();
drop function if exists care.release(uuid, text, boolean, jsonb, text);
drop function if exists care.save_progress(uuid, text, jsonb);
drop function if exists care.extend_lease(uuid, text, int);
drop function if exists care.claim_jobs(text, int);

drop table if exists care.inbound_events cascade;
drop table if exists care.jobs cascade;
drop table if exists care.job_kinds_budget cascade;
drop table if exists care.connections cascade;

-- Расширения pg_cron и pg_net не снимаются: ими пользуется действующий
-- контур статей, и удаление остановило бы его работу.

commit;
