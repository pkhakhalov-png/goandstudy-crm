-- Откат блока 0.
--
-- Возвращает схему ровно к тому, что было до 20260924100000_sales_block0.sql.
-- Выложенный код после отката работать перестанет там, где читает новые поля,
-- поэтому порядок отката обратный выкатке: сначала выключить флаги в
-- `rop_settings` (поведение возвращается к прежнему в ту же секунду), убедиться,
-- что всё в порядке, и только потом снимать колонки.
--
-- Что теряется безвозвратно: след «кто и когда отметил исход» и различие
-- «сделана / протухла» у задач. Сами исходы (`bookings.status`) и сами задачи
-- не трогаются — они жили до этой миграции и переживут её откат.

begin;

drop index if exists public.idx_bookings_pending_outcome;
drop index if exists public.idx_deal_tasks_open_by_user;

alter table public.bookings
  drop column if exists outcome_at,
  drop column if exists outcome_by;

alter table public.deal_tasks
  drop column if exists closed_as;

alter table public.pipeline_stages
  drop column if exists counts_in_sales;

delete from public.rop_settings
 where key in ('funnel_autoclose', 'task_expire_days', 'outcome_prompt_hours');

commit;

-- Проверить:
--   select column_name from information_schema.columns
--    where table_name = 'bookings' and column_name like 'outcome%';   -- пусто
--   select key from public.rop_settings order by key;                 -- трёх ключей нет
