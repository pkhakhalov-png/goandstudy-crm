-- Откат 036. Снимает отпечаток прежнего кабинета.
--
-- После отката правки в старом кабинете по переведённым клиентам снова
-- перестают быть заметными: две системы расходятся молча.

begin;

alter table care.cases
  drop column if exists legacy_fingerprint,
  drop column if exists legacy_checked_at;

commit;
