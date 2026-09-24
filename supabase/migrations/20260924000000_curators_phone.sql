-- Телефон и полное ФИО куратора.
--
-- До сих пор в curators не было куда положить ни номер, ни фамилию с отчеством:
-- есть name (везде одно имя — «Жанель», «Милена»), email и contact (в contact
-- лежит дубль email). Остальное админ держал вне CRM.
--
-- name оставляем коротким именем: он идёт в «Привет, {name}!» в письмах и в
-- шапку карточки. Полное ФИО — отдельным полем, чтобы не портить обращение.
-- Телефон без нормализации: номера приходят и как +7…, и как 7…, и с пробелами.

begin;

alter table public.curators
  add column if not exists phone text,
  add column if not exists full_name text;

comment on column public.curators.phone is
  'Телефон куратора, как ввёл админ (формат свободный).';
comment on column public.curators.full_name is
  'Полное ФИО. name остаётся коротким именем для обращений в письмах.';

commit;
