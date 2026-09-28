-- Откат 002. Убирает людей, дела, доступ и флаги кабинета v2.
--
-- Существующие таблицы не затрагиваются: миграция 002 их не меняла, откатывать
-- в public нечего. Схема care остаётся — её снимает откат 001.
--
-- Данные при откате теряются: дела, контакты и флаги живут только здесь.
-- Это осознанно — откат 002 означает «контура v2 не было».

begin;

drop table if exists care.contacts cascade;
drop table if exists care.case_members cascade;
drop table if exists care.cases cascade;
drop table if exists care.members cascade;
drop table if exists care.feature_flags cascade;
drop table if exists care.autonomy_policy cascade;
drop table if exists care.settings cascade;

-- Функция отметки времени общая для 002 и 006. Снимаем только если её больше
-- некому использовать: иначе откат 002 сломает таблицы очереди из 006.
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'care' and not t.tgisinternal
  ) then
    drop function if exists care.touch_updated_at();
  end if;
end $$;

commit;
