-- Откат 038. Возвращает потолок проверок к двадцати долларам в сутки.
--
-- После отката прогон проверок снова сможет истратить за сутки больше, чем вся
-- работа кабинета.

begin;

update care.job_kinds_budget
   set daily_budget_usd = 20.00, updated_at = now()
 where kind = 'tests';

commit;
