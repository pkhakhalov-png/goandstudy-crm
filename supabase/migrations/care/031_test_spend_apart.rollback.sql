-- Откат 031. Расход проверок снова считается наравне с рабочим.
--
-- После отката прогон проверок опять способен исчерпать дневной потолок
-- подбора и оставить куратора без подборок до полуночи.

begin;

drop function if exists care.spent_today_test();

create or replace function care.spent_today(p_kind text)
returns numeric
language sql
stable
as $$
  select coalesce(sum(usd), 0)
    from care.ai_spend
   where kind = p_kind
     and (created_at at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
         = (now() at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
$$;

drop index if exists care.care_ai_spend_live_idx;
alter table care.ai_spend drop column if exists is_test;
delete from care.job_kinds_budget where kind = 'tests';

commit;
