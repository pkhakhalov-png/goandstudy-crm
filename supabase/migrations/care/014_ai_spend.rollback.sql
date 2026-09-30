-- Откат 014. Снимает журнал расхода и возвращает потолки в ноль.
--
-- Ноль означает «не расходовать»: после отката код, проверяющий потолок,
-- откажется звать модель — и это правильное поведение для контура, у которого
-- учёта расхода больше нет.

begin;

update care.job_kinds_budget set daily_budget_usd = 0, updated_at = now()
 where kind in ('outbound', 'extraction');

drop function if exists care.spent_today(text);
drop table if exists care.ai_spend;

commit;
