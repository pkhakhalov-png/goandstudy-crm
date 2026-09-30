-- Откат 012. Снимает производителя заданий и возвращает расписание к одному
-- заданию cron, как было после миграции 006.
--
-- Порядок важен: сначала снять расписание, потом удалять функцию. Иначе
-- `care_enqueue` остался бы в cron и падал каждые пять минут в журнал базы.

begin;

do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('care_tick', 'care_enqueue');
exception when others then null;
end $$;

create or replace function care.schedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'care_tick';
  perform cron.schedule('care_tick', '* * * * *', $q$ select care.dispatch_tick(); $q$);
end $$;

create or replace function care.unschedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'care_tick';
end $$;

drop function if exists care.enqueue_due_jobs();

commit;
