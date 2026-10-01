-- Кабинет куратора v2, миграция 031: расход проверок считается отдельно.
--
-- ЧТО СЛУЧИЛОСЬ. Прогон проверок израсходовал дневной потолок подбора: 15.09
-- из 15. Это значит, что до полуночи куратор не соберёт ни одной подборки и не
-- спросит ничего у интернета — кнопка откажет с текстом «потолок исчерпан».
-- Проверки сломали работу, которую должны защищать.
--
-- ПОЧЕМУ НЕ ПОДНЯТЬ ПОТОЛОК. Потому что дело не в его размере. Проверки зовут
-- модель по-настоящему — иначе они ничего не проверяют, — и сколько бы ни было
-- отведено, они будут есть из той же тарелки. Поднятый потолок только отодвигает
-- тот же день.
--
-- ПОЧЕМУ НЕ ПЕРЕСТАТЬ СЧИТАТЬ ИХ РАСХОД. Деньги потрачены настоящие, и не
-- видеть их — хуже всего: расход проверок рос бы незаметно.
--
-- ЧТО ДЕЛАЕМ. Помечаем строку расхода как проверочную и не учитываем такие в
-- дневном потолке рабочих видов. У проверок свой потолок, своим видом: он их
-- так же остановит, если что-то зациклится, но остановит их, а не куратора.
--
-- Признак ставит код по переменной окружения, которую выставляет только
-- конфигурация проверок. Подделать её из браузера нельзя — она читается на
-- сервере, где исполняется вызов модели.
--
-- Откат: supabase/migrations/care/031_test_spend_apart.rollback.sql

begin;

alter table care.ai_spend
  add column if not exists is_test boolean not null default false;

comment on column care.ai_spend.is_test is
  'Расход прогона проверок. В дневной потолок рабочих видов не входит.';

create index if not exists care_ai_spend_live_idx
  on care.ai_spend (kind, created_at) where not is_test;

-- Потолок рабочих видов считает только рабочий расход.
create or replace function care.spent_today(p_kind text)
returns numeric
language sql
stable
as $$
  select coalesce(sum(usd), 0)
    from care.ai_spend
   where kind = p_kind
     and not is_test
     and (created_at at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
         = (now() at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
$$;

-- Отдельный счёт для проверок: та же защита от зацикливания, но своя.
create or replace function care.spent_today_test()
returns numeric
language sql
stable
as $$
  select coalesce(sum(usd), 0)
    from care.ai_spend
   where is_test
     and (created_at at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
         = (now() at time zone coalesce(
           (select value #>> '{}' from care.settings where key = 'timezone'),
           'Europe/Moscow'))::date
$$;

comment on function care.spent_today_test() is
  'Сколько потратил на модель прогон проверок за сегодня — отдельно от работы';

-- Двадцать долларов: полный прогон обходится примерно в два, и потолок здесь
-- ловит зацикленную проверку, а не ограничивает обычный день разработки.
insert into care.job_kinds_budget (kind, daily_budget_usd)
values ('tests', 20.00)
on conflict (kind) do update set daily_budget_usd = 20.00, updated_at = now();

commit;
