-- Откат 016. Снимает отметку о разборе переписки.
--
-- После отката ближайший разбор прочитает переписку с начала и предложит
-- факты заново. Дублей это не создаст — правило пропускает факты, которые по
-- этому полю с этим значением уже заводились.

begin;

drop index if exists care.care_cases_extract_idx;
alter table care.cases drop column if exists facts_extracted_at;

commit;
