-- Откат 008. Снимает признак синтетического дела.
--
-- ВНИМАНИЕ: сначала удаляет сами тестовые дела. Оставить их без признака
-- значит смешать с настоящими навсегда — отличить будет уже нечем.

begin;

delete from care.cases where is_synthetic;

drop index if exists care.care_cases_synthetic_idx;
alter table care.cases drop constraint if exists care_cases_synthetic_name;
alter table care.cases drop column if exists synthetic_name;
alter table care.cases drop column if exists is_synthetic;

commit;
