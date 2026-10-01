-- Откат 023. Возвращает потолок подбора к пяти долларам в день.
--
-- После отката подбор будет отказывать на четвёртом-пятом запуске за день,
-- сообщая куратору причину словами.

begin;

update care.job_kinds_budget
   set daily_budget_usd = 5.00, updated_at = now()
 where kind = 'research';

commit;
