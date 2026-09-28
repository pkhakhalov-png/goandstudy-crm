-- Кабинет куратора v2, миграция 002: люди, дела, доступ и флаги.
--
-- Что делает. Заводит семь таблиц схемы care: кто работает в контуре
-- (members), какие дела ведутся (cases), кто ещё допущен к делу
-- (case_members), с кем разговариваем (contacts), что кому включено
-- (feature_flags), насколько модели позволено действовать самой
-- (autonomy_policy) и настройки контура (settings).
--
-- Чего не делает. Не трогает ни одной существующей таблицы. Связь с рабочими
-- данными — по значению (clients.id, users.id), без внешнего ключа: ставить FK
-- в чужую схему значит сделать удаление клиента в старой CRM зависимым от
-- нашей таблицы. Целостность проверяется кодом при заведении дела.
--
-- Почему флаги таблицей, а не переменной окружения. Переменную на Vercel
-- нельзя включить одному куратору и не включить другому. Пилот по одному
-- клиенту без этого невозможен.
--
-- Откат: supabase/migrations/care/002_people_and_access.rollback.sql

begin;

-- ── Общее ───────────────────────────────────────────────────────────────────
--
-- Отметка времени правки. Ставится триггером, а не кодом: код можно забыть, и
-- тогда updated_at врёт молча — хуже, чем если бы его не было вовсе.

create or replace function care.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Сотрудники контура ──────────────────────────────────────────────────────
--
-- Отдельно от public.users намеренно. Роль в старой CRM (curator/rop/admin) и
-- роль в деле — разные вещи: главным по направлению может быть человек с
-- ролью rop, а специалистом по визам — тот, у кого в CRM роль curator.

create table care.members (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique,
  care_role     text not null check (care_role in ('curator', 'lead', 'deputy', 'specialist')),
  team_lead_id  uuid null references care.members(id) on delete set null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table care.members is
  'Сотрудник в контуре v2. user_id — public.users.id по значению, без FK: чужая схема.';
comment on column care.members.team_lead_id is
  'Кто руководитель. Определяет, чьи дела видит lead. Самоссылка, поэтому FK здесь уместен.';

create index care_members_team_lead_idx on care.members (team_lead_id) where team_lead_id is not null;

-- ── Дело ────────────────────────────────────────────────────────────────────
--
-- Дело — это кампания поступления одного студента на один год набора. Не
-- «клиент»: тот же человек может поступать второй раз, и смешивать две
-- кампании в одной карточке значит потерять, к какой из них относится дедлайн.

create table care.cases (
  id                uuid primary key default gen_random_uuid(),
  client_id         bigint not null,
  intake_year       int not null,
  intake_term       text null,
  service_scope     text null,
  status            text not null default 'active'
                      check (status in ('active', 'paused', 'completed', 'archived')),
  owner_member_id   uuid null references care.members(id) on delete restrict,
  automation_owner  text not null default 'legacy' check (automation_owner in ('legacy', 'v2')),
  switched_at       timestamptz null,
  notes             text null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, intake_year, intake_term)
);

comment on table care.cases is
  'Кампания поступления. client_id — public.clients.id по значению, без FK.';
comment on column care.cases.automation_owner is
  'Кто ведёт автоматизацию: legacy или v2. Значение по умолчанию legacy — новый контур молчит, пока его явно не включили.';
comment on column care.cases.switched_at is
  'Когда дело переведено в v2. Нужно, чтобы заметить правки в старом кабинете после переключения.';

create index care_cases_client_idx on care.cases (client_id);
create index care_cases_owner_idx on care.cases (owner_member_id);
create index care_cases_automation_idx on care.cases (automation_owner) where automation_owner = 'v2';

-- ── Участники дела ──────────────────────────────────────────────────────────
--
-- Срок действия, а не просто список. Помощь на две недели должна сама
-- закончиться: доступ, который забыли снять, — это доступ навсегда.

create table care.case_members (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references care.cases(id) on delete cascade,
  member_id   uuid not null references care.members(id) on delete cascade,
  role        text not null,
  valid_from  timestamptz not null default now(),
  valid_to    timestamptz null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column care.case_members.valid_to is
  'null — доступ действует. Проверка прав обязана смотреть сюда, иначе временная помощь становится постоянной.';

create index care_case_members_case_idx on care.case_members (case_id);
create index care_case_members_member_idx on care.case_members (member_id);

-- ── Контакты по делу ────────────────────────────────────────────────────────
--
-- Получатель сообщения берётся отсюда и только отсюда. Если бы адрес приходил
-- в payload предложения, подменённый текст мог бы увести отправку на чужой
-- адрес — а это ровно тот случай, ради которого делается проверка T19.

create table care.contacts (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references care.cases(id) on delete cascade,
  kind        text not null check (kind in ('student', 'parent', 'payer')),
  name        text not null,
  tg_chat_id  bigint null,
  phone       text null,
  email       text null,
  can_decide  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column care.contacts.can_decide is
  'Может ли этот человек принимать решения. Платит родитель, а учится студент — согласовывать нужно с тем, кто решает.';

create index care_contacts_case_idx on care.contacts (case_id);
create index care_contacts_tg_idx on care.contacts (tg_chat_id) where tg_chat_id is not null;

-- ── Флаги ───────────────────────────────────────────────────────────────────
--
-- Три уровня: клиент, куратор, все. Ближайший найденный побеждает. Пустая
-- таблица означает «выключено везде» — это и есть состояние сразу после
-- применения миграции, и оно правильное: включать нужно осознанно.

create table care.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null check (scope in ('client', 'curator', 'all')),
  scope_id    text null,
  flag        text not null check (flag in ('ui', 'ai', 'autowrite', 'outbound')),
  enabled     boolean not null default false,
  set_by      uuid null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- scope='all' не имеет адресата, поэтому scope_id обязан быть пустым: иначе
  -- появятся две записи «для всех» с разными значениями и неопределённым исходом.
  check ((scope = 'all' and scope_id is null) or (scope <> 'all' and scope_id is not null))
);

-- Уникальность с null в scope_id обычный unique не ловит: null не равен null.
-- Поэтому два частичных индекса вместо одного ограничения.
create unique index care_feature_flags_scoped_uniq
  on care.feature_flags (scope, scope_id, flag) where scope_id is not null;
create unique index care_feature_flags_all_uniq
  on care.feature_flags (flag) where scope = 'all';

comment on table care.feature_flags is
  'Отсутствие записи = выключено. Порядок разрешения: client → curator → all.';

-- ── Автономность ────────────────────────────────────────────────────────────

create table care.autonomy_policy (
  id           uuid primary key default gen_random_uuid(),
  action_type  text not null,
  mode         text not null check (mode in ('auto', 'confirm', 'human')),
  set_by       uuid null,
  version      int not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (action_type, version)
);

comment on table care.autonomy_policy is
  'Что модели позволено делать без человека. Отсутствие строки трактуется кодом как human.';

-- ── Настройки ───────────────────────────────────────────────────────────────

create table care.settings (
  key         text primary key,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table care.settings is
  'tick_url, timezone, quiet_hours, templates, requirements_ttl_days и прочее, что меняется без выката кода.';

insert into care.settings (key, value) values
  ('timezone',    to_jsonb('Europe/Moscow'::text)),
  ('quiet_hours', '{"from": "21:00", "to": "09:00"}'::jsonb)
on conflict (key) do nothing;

-- ── Триггеры отметки времени ────────────────────────────────────────────────

create trigger care_members_touch before update on care.members
  for each row execute function care.touch_updated_at();
create trigger care_cases_touch before update on care.cases
  for each row execute function care.touch_updated_at();
create trigger care_case_members_touch before update on care.case_members
  for each row execute function care.touch_updated_at();
create trigger care_contacts_touch before update on care.contacts
  for each row execute function care.touch_updated_at();
create trigger care_feature_flags_touch before update on care.feature_flags
  for each row execute function care.touch_updated_at();
create trigger care_autonomy_policy_touch before update on care.autonomy_policy
  for each row execute function care.touch_updated_at();
create trigger care_settings_touch before update on care.settings
  for each row execute function care.touch_updated_at();

-- ── Доступ ──────────────────────────────────────────────────────────────────
--
-- Как в env_marker: RLS включён, единственная разрешающая политика — для роли
-- приложения. Ключи anon и authenticated не получают ничего.

alter table care.members enable row level security;
alter table care.cases enable row level security;
alter table care.case_members enable row level security;
alter table care.contacts enable row level security;
alter table care.feature_flags enable row level security;
alter table care.autonomy_policy enable row level security;
alter table care.settings enable row level security;

create policy care_app_all on care.members         for all to care_app using (true) with check (true);
create policy care_app_all on care.cases           for all to care_app using (true) with check (true);
create policy care_app_all on care.case_members    for all to care_app using (true) with check (true);
create policy care_app_all on care.contacts        for all to care_app using (true) with check (true);
create policy care_app_all on care.feature_flags   for all to care_app using (true) with check (true);
create policy care_app_all on care.autonomy_policy for all to care_app using (true) with check (true);
create policy care_app_all on care.settings        for all to care_app using (true) with check (true);

revoke all on care.members, care.cases, care.case_members, care.contacts,
              care.feature_flags, care.autonomy_policy, care.settings
  from anon, authenticated;

commit;
