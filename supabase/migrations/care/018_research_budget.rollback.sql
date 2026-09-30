-- Откат 018. Возвращает бюджет подбора в ноль.
--
-- Ноль означает «не расходовать»: проверка перед вызовом откажется звать
-- модель, и подбор честно скажет куратору, что выключен.

begin;

update care.job_kinds_budget
   set daily_budget_usd = 0, updated_at = now()
 where kind = 'research';

commit;
