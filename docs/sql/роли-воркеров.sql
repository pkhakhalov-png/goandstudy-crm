-- Узкие роли для воркеров (E4.2).
--
-- Сейчас всё ходит под service_role: воркеры, кнопки админки, скрипты и
-- проверочные прогоны. Этот ключ обходит RLS во всех схемах, включая public с
-- клиентами и платежами, и может удалить что угодно, включая журнал аудита.
--
-- Роли заводятся сейчас, а переключение на них — отдельный шаг, и он
-- намеренно не делается этой миграцией. PostgREST выбирает роль по claim в
-- JWT, значит переключение требует выпускать подписанные токены и раскладывать
-- их по процессам. Сделать это вслепую — верный способ остановить выпуск
-- статей из-за отсутствующего grant на таблицу, о которой никто не вспомнил.
--
-- Порядок сужения и обоснование — в docs/adr/0006-prava-vorkerov.md.
--
-- Эта миграция ничего не меняет в работе: роли созданы, но ими пока никто не
-- пользуется. Применять её безопасно.

begin;

-- nologin: под этими ролями не подключаются напрямую, в них переключается
-- PostgREST по claim в токене.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'content_worker') then
    create role content_worker nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'content_reader') then
    create role content_reader nologin;
  end if;
end $$;

-- authenticator должен уметь переключиться в эти роли, иначе токен с ними
-- не сработает.
grant content_worker to authenticator;
grant content_reader to authenticator;

-- ── Что может воркер ────────────────────────────────────────────────────────

grant usage on schema content to content_worker;
grant usage on schema seo     to content_worker;

-- Читать и писать, но НЕ удалять. Удаление идёт через функции, которые пишут
-- в журнал: право удалять мимоходом и есть то, чего у воркера быть не должно.
grant select, insert, update on all tables in schema content to content_worker;
grant select, insert, update on all tables in schema seo     to content_worker;
grant usage, select on all sequences in schema content to content_worker;
grant usage, select on all sequences in schema seo     to content_worker;

alter default privileges in schema content grant select, insert, update on tables to content_worker;
alter default privileges in schema seo     grant select, insert, update on tables to content_worker;
alter default privileges in schema content grant usage, select on sequences to content_worker;
alter default privileges in schema seo     grant usage, select on sequences to content_worker;

-- Журнал аудита — только дописывать. Запись, которую можно исправить, журналом
-- не является.
revoke update on content.audit_events from content_worker;

grant execute on function content.record_verified(bigint, int, text, bigint, text, jsonb, text, text, text) to content_worker;
grant execute on function content.consume_verified(text, int) to content_worker;
grant execute on function content.reconcile_verified() to content_worker;
grant execute on function content.supersede_older(bigint, bigint) to content_worker;
grant execute on function content.schedule_publication(bigint, bigint, timestamptz, text, text, int) to content_worker;
grant execute on function content.catch_up(bigint, timestamptz) to content_worker;

-- purge_package воркеру НЕ даётся. Удаление пакета — решение человека,
-- и оно пишется в журнал от его имени.

-- ── Что может читатель ──────────────────────────────────────────────────────

grant usage on schema content to content_reader;
grant usage on schema seo     to content_reader;
grant select on all tables in schema content to content_reader;
grant select on all tables in schema seo     to content_reader;
alter default privileges in schema content grant select on tables to content_reader;
alter default privileges in schema seo     grant select on tables to content_reader;

-- Ни та, ни другая роль не получает ничего в схеме public: клиенты, платежи и
-- расходы к контент-машине отношения не имеют, и доступ к ним ей не нужен.

commit;

-- Проверить:
--   select rolname from pg_roles where rolname in ('content_worker', 'content_reader');
--   ожидается: две строки
--
--   select count(*) from information_schema.role_table_grants
--    where grantee = 'content_worker' and privilege_type = 'DELETE';
--   ожидается: 0 — удалять воркер не может нигде
