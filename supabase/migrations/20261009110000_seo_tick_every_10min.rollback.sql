begin;
create or replace function seo.schedule_all()
returns void language plpgsql as $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'seo_tick';
  perform cron.schedule('seo_tick', '* * * * *', $q$ select seo.dispatch_tick(); $q$);
end $$;
select cron.alter_job(jobid, schedule := '* * * * *') from cron.job where jobname = 'seo_tick';
commit;
