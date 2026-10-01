-- Откат 024. Возвращает закрытые падения в `failed`.
--
-- Пометку из текста ошибки снимаем, иначе при повторном применении она
-- наложится вторым слоем.

begin;

update care.jobs
   set status = 'failed',
       last_error = replace(last_error, ' · закрыто миграцией 024: обработчик завезли позже', '')
 where status = 'cancelled'
   and last_error like 'нет обработчика для вида%';

commit;
