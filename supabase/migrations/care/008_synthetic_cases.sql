-- Кабинет куратора v2, миграция 008: признак синтетического дела.
--
-- ЗАЧЕМ. База у контура боевая, и тестовые дела неизбежно окажутся рядом с
-- настоящими. Раздел 2.7 архитектуры требует, чтобы их можно было отличить
-- одним полем и убрать одной командой. В миграции 002 это поле я не завёл —
-- исправляю до того, как синтетика появилась.
--
-- Без признака тестовые дела пришлось бы опознавать по имени или диапазону
-- идентификаторов, то есть угадывать. Угаданная граница между тестовыми и
-- настоящими данными рано или поздно проходит не там.
--
-- ПОЧЕМУ ИМЯ ХРАНИТСЯ ЗДЕСЬ. У настоящего дела имя берётся из
-- `public.clients` по `client_id`. У синтетического такой строки нет и быть
-- не должно: в рабочую таблицу контур не пишет. Значит имя живёт в самом
-- деле — только для синтетики.
--
-- Откат: supabase/migrations/care/008_synthetic_cases.rollback.sql

begin;

alter table care.cases
  add column if not exists is_synthetic boolean not null default false,
  add column if not exists synthetic_name text;

comment on column care.cases.is_synthetic is
  'Тестовое дело. Очистка: delete from care.cases where is_synthetic. Старый кабинет их не видит — он про схему care не знает.';
comment on column care.cases.synthetic_name is
  'Имя для показа у синтетического дела. У настоящего имя берётся из public.clients — здесь остаётся пустым.';

-- Синтетика без имени бесполезна, настоящее дело с именем здесь — признак
-- того, что кто-то начал дублировать рабочие данные в схему контура.
alter table care.cases add constraint care_cases_synthetic_name
  check ((is_synthetic and synthetic_name is not null) or (not is_synthetic and synthetic_name is null));

-- Отдельный индекс: экраны будут спрашивать «покажи без тестовых» чаще, чем
-- что-либо ещё, а тестовых мало и они хорошо отсекаются частичным индексом.
create index if not exists care_cases_synthetic_idx on care.cases (is_synthetic) where is_synthetic;

commit;
