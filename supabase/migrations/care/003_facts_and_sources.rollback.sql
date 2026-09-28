-- Откат 003. Снимает факты и источники.
--
-- Данные теряются: они живут только здесь. Рабочие таблицы не затрагиваются —
-- миграция 003 их и не меняла.

begin;

drop table if exists care.fact_conflicts cascade;
drop table if exists care.facts cascade;
drop table if exists care.sources cascade;

commit;
