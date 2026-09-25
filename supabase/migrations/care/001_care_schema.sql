-- Кабинет куратора v2: схема, роль и отпечаток режима.
--
-- Что делает этот файл. Заводит отдельную схему `care` и роль `care_app`,
-- под которой будет работать новый кабинет. Существующие таблицы не меняются:
-- по `public` здесь только GRANT SELECT перечислением, ни одного ALTER.
--
-- Почему роль, а не дисциплина в коде. База у нового кабинета боевая —
-- так решил владелец 25.09.2026. Значит любая ошибка в коде теоретически
-- способна испортить рабочие данные. Роль закрывает это на уровне базы:
-- писать в `public` ей просто не выдано права, и никакой код этого не обойдёт.
--
-- Откат: supabase/migrations/care/001_care_schema.rollback.sql

begin;

-- ── Схема ───────────────────────────────────────────────────────────────────

create schema if not exists care;

comment on schema care is
  'Кабинет куратора v2. Отдельный контур: существующие таблицы public не затрагиваются.';

-- ── Роль приложения ─────────────────────────────────────────────────────────
--
-- PostgREST переключается на роль из claim `role` в JWT. Чтобы переключение
-- было разрешено, роль должна быть выдана служебной роли `authenticator`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'care_app') then
    create role care_app nologin;
  end if;
end $$;

grant care_app to authenticator;

grant usage on schema care to care_app;

-- Всё, что появится в схеме дальше, сразу доступно роли: иначе каждую новую
-- таблицу пришлось бы отдельно вспоминать, а забытый GRANT — это отказ в бою.
alter default privileges in schema care
  grant select, insert, update, delete on tables to care_app;
alter default privileges in schema care
  grant usage, select on sequences to care_app;

-- ── Чтение рабочих таблиц ───────────────────────────────────────────────────
--
-- Перечислением, а не `all tables in schema public`. Список — ровно то, что
-- новому кабинету нужно показать куратору. Финансы (payments, expenses),
-- оценки разговоров и воронка продаж сюда намеренно не входят.

grant usage on schema public to care_app;

grant select on
  public.clients,
  public.curators,
  public.users,
  public.client_applications,
  public.client_universities,
  public.client_documents,
  public.client_tg_messages,
  public.client_tg_files,
  public.client_activities,
  public.client_essays,
  public.client_scholarships,
  public.curator_stages,
  public.curator_stage_checklist,
  public.curator_templates
to care_app;

-- ── Отпечаток режима ────────────────────────────────────────────────────────
--
-- Рубильник внешних отправок живёт в базе, а не в переменной окружения.
-- Переменную на Vercel можно переставить деплоем и не заметить; строку в базе
-- меняет только миграция, то есть осознанное действие с файлом в репозитории.

create table care.env_marker (
  id              boolean primary key default true check (id),
  mode            text not null default 'pilot' check (mode in ('pilot', 'prod')),
  external_sends  boolean not null default false,
  note            text,
  updated_at      timestamptz not null default now()
);

insert into care.env_marker (id, mode, external_sends, note)
values (true, 'pilot', false, 'Разработка v2. Наружу не отправляется ничего.')
on conflict (id) do nothing;

comment on table care.env_marker is
  'Один ряд. external_sends=false — модуль отправок наружу не ходит, что бы ни говорили переменные окружения.';

-- ── Доступ только через роль приложения ─────────────────────────────────────
--
-- RLS включён, разрешающая политика — одна, для care_app. Анонимный и
-- пользовательский ключи не получают ничего даже если схему откроют для API.

alter table care.env_marker enable row level security;

create policy care_app_all on care.env_marker
  for all to care_app using (true) with check (true);

revoke all on care.env_marker from anon, authenticated;
grant select, insert, update, delete on care.env_marker to care_app;

commit;
