-- Откат автозакрытия протухших задач.
--
-- Снимает расписание и саму функцию. Уже закрытые задачи НЕ возвращаются в
-- работу: вернуть 333 просроченных задачи в список — значит вернуть ровно ту
-- свалку, ради разбора которой всё и делалось. Если вернуть всё-таки нужно,
-- это отдельное осознанное действие:
--
--   update public.deal_tasks
--      set is_done = false, completed_at = null, closed_as = null
--    where closed_as = 'expired';

begin;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire-stale-tasks');
  end if;
exception when others then
  raise notice 'расписания expire-stale-tasks не было — пропускаем';
end $$;

drop function if exists public.expire_stale_tasks();

commit;
